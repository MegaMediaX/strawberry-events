import { prisma } from "@/lib/db/client";
import { getOrder } from "@/lib/pretix/orders";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import { confirmationEmail } from "@/lib/email/templates";
import type { ReconcileCtx } from "./types";

/**
 * Reconcile a pretix `order.paid` into the platform: flip the AttendeeOrder to
 * paid, backfill the position secret (retires the always-null pretixSecret), and
 * — only when no approval is outstanding — issue the ticket (email + webhooks).
 * Idempotent via a compare-and-set updateMany guarded on status=pending.
 */
export async function handleOrderPaid(ctx: ReconcileCtx): Promise<void> {
  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: ctx.eventMappingId, orderCode: ctx.orderCode },
  });
  if (!order) {
    console.warn("[pretix-webhook] order.paid for unknown order", ctx.orderCode);
    return;
  }
  if (order.status === "paid") return; // already reconciled

  // Pull the position secret (the QR payload) from pretix.
  let secret: string | undefined;
  try {
    const pretixOrder = await getOrder(ctx.organizerSlug, ctx.pretixEventSlug, ctx.orderCode, ctx.token);
    secret = pretixOrder.positions?.[0]?.secret ?? undefined;
  } catch (err) {
    // Surface so the route returns 500 and pretix retries (handler is idempotent).
    throw err;
  }

  const res = await prisma.attendeeOrder.updateMany({
    where: { id: order.id, status: "pending" },
    data: { status: "paid", ...(secret ? { pretixSecret: secret } : {}) },
  });
  if (res.count === 0) return; // a concurrent delivery won

  emit(ctx.organizationId, "order.paid", { orderCode: ctx.orderCode }, ctx.eventMappingId);

  // Payment may arrive before a manual approval decision: mark paid but do NOT
  // issue the ticket yet — approve() issues it once the admin decides.
  if (order.approvalStatus === "pending") return;

  emit(ctx.organizationId, "ticket.issued", { orderCode: ctx.orderCode }, ctx.eventMappingId);
  try {
    const ticketUrl = `${process.env.APP_URL ?? ""}/en/t/${order.magicLinkToken}`;
    await sendEmail(
      {
        to: order.email,
        ...confirmationEmail("en", ctx.pretixEventSlug, ctx.orderCode, ticketUrl),
      },
      { templateType: "ticket_issued", organizationId: ctx.organizationId, eventMappingId: ctx.eventMappingId, attendeeRef: ctx.orderCode },
    );
  } catch {
    // best-effort: never fail reconciliation on email
  }
}
