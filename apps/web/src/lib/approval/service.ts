import type { AttendeeApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent, scopeWhere } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import {
  confirmationEmail,
  approvedPaymentEmail,
  rejectedEmail,
} from "@/lib/email/templates";
import { recipientLocale } from "@/lib/email/recipient-locale";

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

async function bestEffortEmail(
  to: string,
  msg: { subject: string; text: string },
  meta?: { templateType: string; organizationId: string; eventMappingId: string; attendeeRef: string },
) {
  try {
    await sendEmail({ to, ...msg }, meta);
  } catch {
    // swallow
  }
}

export async function approve(session: SessionContext, orderId: string) {
  const order = await loadDecidable(session, orderId);

  // Idempotent: approving an already-approved registration returns current state.
  if (order.approvalStatus === "approved") return order;
  // Only pending registrations can be approved (never resurrect a rejected one).
  if (order.approvalStatus !== "pending") {
    throw new ForbiddenError(`Cannot approve a registration in '${order.approvalStatus}' state`);
  }

  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  const locale = await recipientLocale(order.userId);

  const isFree = order.provider === "free" || order.totalCents === 0;

  // payBeforeApproval: when the event requires payment to precede approval, a
  // paid-tier order may not be approved until it has actually been paid. Free
  // orders are exempt (nothing to pay). Without this flag, approval of a paid
  // order leaves it approved+pending-payment as before.
  if (order.eventMapping.payBeforeApproval && !isFree && order.status !== "paid") {
    throw new ForbiddenError(
      "Payment must be completed before this registration can be approved",
    );
  }

  const newStatus: "pending" | "paid" = isFree ? "paid" : "pending";

  // Claim the transition atomically (closes the double-decision TOCTOU race).
  const claim = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, approvalStatus: "pending" },
    data: { approvalStatus: "approved", status: newStatus },
  });
  if (claim.count === 0) {
    // Lost the race to a concurrent decision — return whatever state won.
    const current = await getApproval(session, orderId);
    return current ?? order;
  }

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
  }

  const updated = { ...order, approvalStatus: "approved" as const, status: newStatus };

  const appUrl = process.env.APP_URL ?? "";
  if (isFree) {
    const ticketUrl = `${appUrl}/${locale}/t/${order.magicLinkToken}`;
    await bestEffortEmail(
      order.email,
      confirmationEmail(locale, order.eventMapping.titleEn, order.orderCode, ticketUrl),
      { templateType: "ticket_issued", organizationId: org.id, eventMappingId: order.eventMappingId, attendeeRef: order.orderCode },
    );
  } else {
    await bestEffortEmail(
      order.email,
      approvedPaymentEmail(locale, order.eventMapping.titleEn, order.orderCode),
      { templateType: "approved", organizationId: org.id, eventMappingId: order.eventMappingId, attendeeRef: order.orderCode },
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

  // Idempotent: rejecting an already-rejected registration returns current state.
  if (order.approvalStatus === "rejected") return order;
  // Never silently revoke a live ticket: block rejecting an issued/approved order.
  // (An explicit cancel/revoke flow would be required to invalidate a valid QR.)
  if (order.status === "paid" || order.approvalStatus === "approved") {
    throw new ForbiddenError(
      "Cannot reject an issued or approved registration; use a cancel/revoke flow",
    );
  }
  if (order.approvalStatus !== "pending") {
    throw new ForbiddenError(`Cannot reject a registration in '${order.approvalStatus}' state`);
  }

  const org = await prisma.organization.findUnique({
    where: { id: order.eventMapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  const locale = await recipientLocale(order.userId);

  // Claim the transition atomically.
  const claim = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, approvalStatus: "pending" },
    data: { approvalStatus: "rejected", status: "canceled" },
  });
  if (claim.count === 0) {
    const current = await getApproval(session, orderId);
    return current ?? order;
  }

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

  // Free any seats reserved by this order so they return to the pool.
  await releaseSeats(order.orderCode).catch(() => {});

  const updated = { ...order, approvalStatus: "rejected" as const, status: "canceled" as const };

  await bestEffortEmail(
    order.email,
    rejectedEmail(locale, order.eventMapping.titleEn, order.orderCode),
    { templateType: "rejected", organizationId: org.id, eventMappingId: order.eventMappingId, attendeeRef: order.orderCode },
  );
  await audit(session, org.id, "registration.rejected", order.id);
  void emit(org.id, "attendee.rejected", { orderCode: order.orderCode }, order.eventMappingId);
  return updated;
}
