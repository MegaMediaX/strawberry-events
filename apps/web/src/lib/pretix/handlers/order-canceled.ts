import { prisma } from "@/lib/db/client";
import { releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import type { ReconcileCtx } from "./types";

/**
 * Reconcile a pretix `order.canceled` (refund / manual cancel in pretix) into the
 * platform: flip the AttendeeOrder to canceled and release any held seats.
 * Idempotent via a compare-and-set guarded on status != canceled.
 */
export async function handleOrderCanceled(ctx: ReconcileCtx): Promise<void> {
  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: ctx.eventMappingId, orderCode: ctx.orderCode },
  });
  if (!order || order.status === "canceled") return;

  const res = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, status: { not: "canceled" } },
    data: { status: "canceled" },
  });
  if (res.count === 0) return; // a concurrent delivery won

  await releaseSeats(ctx.orderCode);
  emit(ctx.organizationId, "seat.released", { orderCode: ctx.orderCode }, ctx.eventMappingId);
  // TODO(product): decide whether a pretix-originated cancellation should email
  // the attendee. The reject() path already emails; left out here intentionally.
}
