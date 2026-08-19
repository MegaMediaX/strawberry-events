import { prisma } from "@/lib/db/client";
import { releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import { orderCanceledEmail } from "@/lib/email/templates";
import { recipientLocale } from "@/lib/email/recipient-locale";
import type { ReconcileCtx } from "./types";

/**
 * Reconcile a pretix `order.canceled` (refund / manual cancel in pretix) into the
 * platform: flip the AttendeeOrder to canceled, release any held seats, and
 * notify the attendee. Idempotent via a compare-and-set guarded on status != canceled.
 */
export async function handleOrderCanceled(ctx: ReconcileCtx): Promise<void> {
  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: ctx.eventMappingId, orderCode: ctx.orderCode },
    include: { eventMapping: { select: { titleEn: true } } },
  });
  if (!order || order.status === "canceled") return;

  const res = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, status: { not: "canceled" } },
    data: { status: "canceled" },
  });
  if (res.count === 0) return; // a concurrent delivery won

  await releaseSeats(ctx.orderCode);
  emit(ctx.organizationId, "seat.released", { orderCode: ctx.orderCode }, ctx.eventMappingId);

  // Notify the attendee their registration was canceled (best-effort, in their
  // stored locale). Mirrors the admin-initiated cancelRegistration path.
  try {
    const locale = await recipientLocale(order.userId);
    await sendEmail(
      { to: order.email, ...orderCanceledEmail(locale, order.eventMapping.titleEn, order.orderCode) },
      {
        templateType: "order_canceled",
        organizationId: ctx.organizationId,
        eventMappingId: ctx.eventMappingId,
        attendeeRef: ctx.orderCode,
      },
    );
  } catch {
    // never fail reconciliation on email
  }
}
