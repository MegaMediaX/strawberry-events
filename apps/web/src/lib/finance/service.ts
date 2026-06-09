import type { AttendeeOrderStatus, AttendeeOrderProvider } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { sendEmail } from "@/lib/email/service";
import { confirmationEmail, type Locale } from "@/lib/email/templates";
import { isTicketIssued } from "./ticket";

export interface FinanceFilters {
  status?: AttendeeOrderStatus;
  provider?: AttendeeOrderProvider;
}

/** List orders the session may see (org-scoped), with optional filters. */
export function listFinanceOrders(
  session: SessionContext,
  filters: FinanceFilters,
) {
  const scope = scopeWhere(session); // {} for super, { organizationId: { in } } otherwise
  const where: Record<string, unknown> = {};
  if (!session.isSuperAdmin && scope.organizationId) {
    where.eventMapping = { organizationId: scope.organizationId };
  }
  if (filters.status) where.status = filters.status;
  if (filters.provider) where.provider = filters.provider;

  return prisma.attendeeOrder.findMany({
    where,
    include: { eventMapping: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Load one order, enforcing org/event access. Null when denied. */
export async function getFinanceOrder(session: SessionContext, orderId: string) {
  const order = await prisma.attendeeOrder.findUnique({
    where: { id: orderId },
    include: { eventMapping: true },
  });
  if (!order) return null;
  if (
    !canAccessEvent(
      session,
      order.eventMapping.organizationId,
      order.eventMapping.localEventId,
    )
  ) {
    return null;
  }
  return order;
}

/**
 * Mark a COD/manual order paid: pretix sync → status → confirmation email →
 * audit. Blocked while impersonating; org-isolated; idempotent.
 */
export async function markOrderPaid(session: SessionContext, orderId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot mark orders paid while impersonating");
  }
  if (!hasAnyRole(session, ["finance", "organizer_admin"])) {
    throw new ForbiddenError("Requires finance or organizer admin");
  }

  const order = await getFinanceOrder(session, orderId);
  if (!order) throw new ForbiddenError("Order not found or access denied");
  if (isTicketIssued(order.status)) return order; // idempotent

  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  // Sync payment with pretix FIRST. Only flip local status (which exposes the QR)
  // when pretix sync succeeds — a real sync failure must not partially issue.
  try {
    await pretixOrders.markOrderPaid(
      ctx.organizerSlug,
      order.eventMapping.pretixEventSlug,
      order.orderCode,
      ctx.token,
    );
  } catch (err) {
    // pretix already considers the order paid (e.g. $0 auto-paid, or a prior
    // partial run) — safe to reconcile the local status.
    if (!(err instanceof PretixValidationError)) {
      // A genuine sync failure: audit it and do NOT issue the ticket locally.
      await prisma.auditLog.create({
        data: {
          organizationId: order.eventMapping.organizationId,
          actorUserId: session.userId,
          action: "order.mark_paid_failed",
          entityType: "order",
          entityId: order.id,
          success: false,
        },
      });
      throw new Error("Payment sync with pretix failed; order was not marked paid");
    }
  }

  const updated = await prisma.attendeeOrder.update({
    where: { id: order.id },
    data: { status: "paid" },
  });

  // Best-effort confirmation email with the ticket link.
  try {
    const appUrl = process.env.APP_URL ?? "";
    const locale: Locale = "en";
    const ticketUrl = `${appUrl}/${locale}/t/${order.magicLinkToken}`;
    const msg = confirmationEmail(
      locale,
      order.eventMapping.titleEn,
      order.orderCode,
      ticketUrl,
    );
    await sendEmail({ to: order.email, ...msg });
  } catch {
    // swallow
  }

  await prisma.auditLog.create({
    data: {
      organizationId: order.eventMapping.organizationId,
      actorUserId: session.userId,
      action: "order.marked_paid",
      entityType: "order",
      entityId: order.id,
    },
  });

  return updated;
}
