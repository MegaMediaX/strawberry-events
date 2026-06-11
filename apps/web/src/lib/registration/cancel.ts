import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import { orderCanceledEmail } from "@/lib/email/templates";
import { recipientLocale } from "@/lib/email/recipient-locale";

/**
 * Cancel/revoke a registration (including an already-issued one). pretix is the
 * source of truth: we mark the order canceled there FIRST, then mirror the
 * `canceled` status locally, release the held seat, notify the attendee, and
 * audit. This is the admin counterpart to the inbound order.canceled webhook —
 * and the path reject() deliberately refuses for issued/approved orders.
 *
 * Restricted to organizer admins / super admins; org-isolated; never while
 * impersonating. Idempotent — a no-op on an already-canceled order. Never
 * hard-deletes; only transitions status.
 */
export async function cancelRegistration(session: SessionContext, orderId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot cancel registrations while impersonating");
  }
  if (!session.isSuperAdmin && !hasAnyRole(session, ["organizer_admin"])) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }

  const order = await prisma.attendeeOrder.findUnique({
    where: { id: orderId },
    include: { eventMapping: true },
  });
  if (
    !order ||
    !canAccessEvent(session, order.eventMapping.organizationId, order.eventMapping.localEventId)
  ) {
    throw new ForbiddenError("Order not found or access denied");
  }
  if (order.status === "canceled") return order; // idempotent

  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  // Cancel in pretix FIRST (source of truth). Tolerate the case where pretix
  // already considers it canceled (idempotent reconcile).
  try {
    await pretixOrders.cancelOrder(
      ctx.organizerSlug,
      order.eventMapping.pretixEventSlug,
      order.orderCode,
      ctx.token,
    );
  } catch (err) {
    if (!(err instanceof PretixValidationError)) {
      await prisma.auditLog.create({
        data: {
          organizationId: order.eventMapping.organizationId,
          actorUserId: session.userId,
          action: "order.cancel_failed",
          entityType: "order",
          entityId: order.id,
          success: false,
        },
      });
      throw new Error("Cancellation sync with pretix failed; order was not canceled");
    }
  }

  // Compare-and-set so a concurrent webhook/admin cancel doesn't double-process.
  const res = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, status: { not: "canceled" } },
    data: { status: "canceled" },
  });
  if (res.count === 0) return order; // already canceled by a concurrent path

  await releaseSeats(order.orderCode);
  emit(order.eventMapping.organizationId, "seat.released", { orderCode: order.orderCode }, order.eventMappingId);

  // Best-effort attendee notification, in their stored locale.
  try {
    const locale = await recipientLocale(order.userId);
    await sendEmail(
      { to: order.email, ...orderCanceledEmail(locale, order.eventMapping.titleEn, order.orderCode) },
      {
        templateType: "order_canceled",
        organizationId: order.eventMapping.organizationId,
        eventMappingId: order.eventMappingId,
        attendeeRef: order.orderCode,
      },
    );
  } catch {
    // never fail the cancellation on email
  }

  await prisma.auditLog.create({
    data: {
      organizationId: order.eventMapping.organizationId,
      actorUserId: session.userId,
      action: "order.canceled",
      entityType: "order",
      entityId: order.id,
    },
  });

  return { ...order, status: "canceled" as const };
}
