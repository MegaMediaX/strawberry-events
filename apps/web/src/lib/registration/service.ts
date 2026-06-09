import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";
import * as pretixOrders from "@/lib/pretix/orders";
import { centsToPrice } from "@/lib/pretix/mappers";
import { selectProvider } from "@/lib/payments/provider";
import { signMagicLink } from "@/lib/tokens/magic-link";
import { sendEmail } from "@/lib/email/service";
import {
  pendingEmail,
  confirmationEmail,
  pendingApprovalEmail,
} from "@/lib/email/templates";
import { requiresApproval } from "@/lib/approval/state";
import { registerInputSchema, type RegisterInput } from "./schema";

export interface RegisterResult {
  orderCode: string;
  status: "pending" | "paid";
  approvalStatus: "not_required" | "pending";
  magicLinkToken: string;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const data = registerInputSchema.parse(input);

  const event = await prisma.eventMapping.findFirst({
    where: { pretixEventSlug: data.eventSlug, visibility: "public" },
  });
  if (!event) throw new Error("Event not found");
  const org = await prisma.organization.findUnique({
    where: { id: event.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  // Recompute prices from pretix (never trust client prices).
  const items = await pretixProducts.listItems(
    ctx.organizerSlug,
    event.pretixEventSlug,
    ctx.token,
  );
  const priceById = new Map(items.map((i) => [i.id, i.priceCents]));

  const positions: { item: number; price: string }[] = [];
  let totalCents = 0;
  for (const sel of data.tickets) {
    const price = priceById.get(sel.itemId) ?? 0;
    for (let n = 0; n < sel.quantity; n++) {
      positions.push({ item: sel.itemId, price: centsToPrice(price) });
      totalCents += price;
    }
  }

  const provider = selectProvider(totalCents);
  const needsApproval = requiresApproval(
    event.approvalMode,
    data.tickets.map((t) => t.itemId),
    event.autoApproveItemIds,
  );

  const order = await pretixOrders.createOrder(
    ctx.organizerSlug,
    event.pretixEventSlug,
    { email: data.attendee.email, locale: data.locale, positions },
    ctx.token,
  );

  // Issue immediately only when no approval is needed AND the order is free.
  let status: "pending" | "paid" = "pending";
  if (!needsApproval && provider === "free") {
    await pretixOrders.markOrderPaid(
      ctx.organizerSlug,
      event.pretixEventSlug,
      order.code,
      ctx.token,
    );
    status = "paid";
  }
  const approvalStatus = needsApproval ? "pending" : "not_required";

  const magicLinkToken = signMagicLink(order.code);

  await prisma.attendeeOrder.create({
    data: {
      eventMappingId: event.id,
      orderCode: order.code,
      email: data.attendee.email,
      userId: data.userId ?? null,
      status,
      approvalStatus,
      provider,
      totalCents,
      magicLinkToken,
    },
  });

  // Email is best-effort: never fail the registration on send errors.
  try {
    const appUrl = process.env.APP_URL ?? "";
    const ticketUrl = `${appUrl}/${data.locale}/t/${magicLinkToken}`;
    const msg = needsApproval
      ? pendingApprovalEmail(data.locale, event.titleEn, order.code)
      : status === "paid"
        ? confirmationEmail(data.locale, event.titleEn, order.code, ticketUrl)
        : pendingEmail(data.locale, event.titleEn, order.code);
    await sendEmail({ to: data.attendee.email, ...msg });
  } catch {
    // swallow
  }

  return { orderCode: order.code, status, approvalStatus, magicLinkToken };
}
