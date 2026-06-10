import { prisma } from "@/lib/db/client";
import { emit } from "@/lib/webhooks/service";
import { checkinEligibility } from "@/lib/checkin/eligibility";
import type { ReconcileCtx } from "./types";

/**
 * Reconcile a pretix `checkin.created` (a scan that happened in pretixSCAN,
 * outside the staff station): record a system-originated BadgePrintLog + audit
 * entry and emit checkin.created. Does NOT re-redeem (pretix already did).
 * printedByUserId/actorUserId are null to mark this as system/pretixSCAN-sourced.
 */
export async function handleCheckinCreated(ctx: ReconcileCtx): Promise<void> {
  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: ctx.eventMappingId, orderCode: ctx.orderCode },
  });
  if (!order) return;

  // pretix is the gate authority; the platform only reconciles state for orders
  // that are actually issued.
  if (!checkinEligibility(order).ok) return;

  const prior = await prisma.badgePrintLog.count({
    where: { eventMappingId: ctx.eventMappingId, attendeeRef: ctx.orderCode },
  });
  await prisma.badgePrintLog.create({
    data: {
      eventMappingId: ctx.eventMappingId,
      attendeeRef: ctx.orderCode,
      printedByUserId: null,
      reprint: prior > 0,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: null,
      action: "attendee.checked_in",
      entityType: "order",
      entityId: order.id,
    },
  });
  emit(ctx.organizationId, "checkin.created", { orderCode: ctx.orderCode }, ctx.eventMappingId);
}
