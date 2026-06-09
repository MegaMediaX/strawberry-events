import type { AttendeeApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent, scopeWhere } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import {
  confirmationEmail,
  approvedPaymentEmail,
  rejectedEmail,
  type Locale,
} from "@/lib/email/templates";

export interface ApprovalFilters {
  approvalStatus?: AttendeeApprovalStatus;
}

/** List registrations in the approval pipeline (org-scoped). */
export function listApprovals(session: SessionContext, filters: ApprovalFilters) {
  const scope = scopeWhere(session);
  const where: Record<string, unknown> = {
    approvalStatus: filters.approvalStatus ?? { in: ["pending", "approved", "rejected"] },
  };
  if (!session.isSuperAdmin && scope.organizationId) {
    where.eventMapping = { organizationId: scope.organizationId };
  }
  return prisma.attendeeOrder.findMany({
    where,
    include: { eventMapping: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApproval(session: SessionContext, orderId: string) {
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

function assertCanDecide(session: SessionContext) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot approve/reject while impersonating");
  }
  if (!hasAnyRole(session, ["organizer_admin"])) {
    // hasAnyRole also returns true for super_admin. finance / checkin_staff fail.
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
}

async function loadDecidable(session: SessionContext, orderId: string) {
  assertCanDecide(session);
  const order = await getApproval(session, orderId);
  if (!order) throw new ForbiddenError("Registration not found or access denied");
  return order;
}

async function audit(session: SessionContext, orgId: string, action: string, id: string) {
  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: session.userId,
      action,
      entityType: "registration",
      entityId: id,
    },
  });
}

async function bestEffortEmail(to: string, msg: { subject: string; text: string }) {
  try {
    await sendEmail({ to, ...msg });
  } catch {
    // swallow
  }
}

export async function approve(session: SessionContext, orderId: string) {
  const order = await loadDecidable(session, orderId);
  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  const locale: Locale = "en";

  const isFree = order.provider === "free" || order.totalCents === 0;
  let newStatus: "pending" | "paid" = "pending";

  if (isFree) {
    // pretix may already have auto-paid the zero-total order; tolerate that.
    try {
      await pretixOrders.markOrderPaid(
        ctx.organizerSlug,
        order.eventMapping.pretixEventSlug,
        order.orderCode,
        ctx.token,
      );
    } catch (err) {
      if (!(err instanceof PretixValidationError)) throw err;
    }
    newStatus = "paid";
  }

  const updated = await prisma.attendeeOrder.update({
    where: { id: order.id },
    data: { approvalStatus: "approved", status: newStatus },
  });

  const appUrl = process.env.APP_URL ?? "";
  if (isFree) {
    const ticketUrl = `${appUrl}/${locale}/t/${order.magicLinkToken}`;
    await bestEffortEmail(
      order.email,
      confirmationEmail(locale, order.eventMapping.titleEn, order.orderCode, ticketUrl),
    );
  } else {
    await bestEffortEmail(
      order.email,
      approvedPaymentEmail(locale, order.eventMapping.titleEn, order.orderCode),
    );
  }

  await audit(session, org.id, "registration.approved", order.id);
  void emit(org.id, "attendee.approved", { orderCode: order.orderCode }, order.eventMappingId);
  if (isFree) {
    void emit(org.id, "order.paid", { orderCode: order.orderCode }, order.eventMappingId);
    void emit(org.id, "ticket.issued", { orderCode: order.orderCode }, order.eventMappingId);
  }
  return updated;
}

export async function reject(session: SessionContext, orderId: string) {
  const order = await loadDecidable(session, orderId);
  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  const locale: Locale = "en";

  try {
    await pretixOrders.cancelOrder(
      ctx.organizerSlug,
      order.eventMapping.pretixEventSlug,
      order.orderCode,
      ctx.token,
    );
  } catch {
    // best-effort pretix cancel
  }

  const updated = await prisma.attendeeOrder.update({
    where: { id: order.id },
    data: { approvalStatus: "rejected", status: "canceled" },
  });

  await bestEffortEmail(
    order.email,
    rejectedEmail(locale, order.eventMapping.titleEn, order.orderCode),
  );
  await audit(session, org.id, "registration.rejected", order.id);
  void emit(org.id, "attendee.rejected", { orderCode: order.orderCode }, order.eventMappingId);
  return updated;
}
