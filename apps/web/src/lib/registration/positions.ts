import { centsToPrice } from "@/lib/pretix/mappers";

/**
 * Pure pretix order-position construction. Kept free of Prisma/email/webhook
 * imports so it can be exercised by both the fast unit suite and the gated live
 * pretix suite without instantiating a PrismaClient.
 */

export interface OrderPositionInput {
  item: number;
  price: string;
  /**
   * Attendee identity forwarded to the pretix position. pretix items configured
   * to "ask for attendee name/email" (typical for admission/badge tickets) reject
   * anonymous positions with a 400 validation error, so we always attach what the
   * registrant entered. Plain `attendee_name` is accepted regardless of the
   * event's name scheme.
   */
  attendee_name?: string;
  attendee_email?: string;
  // Matches pretix's CreateOrderPosition open shape so positions pass straight through.
  [k: string]: unknown;
}

/**
 * Expand each selected ticket into one pretix order position per quantity,
 * priced from pretix (never the client), and carrying the registrant's
 * name/email so items that require an attendee name validate.
 */
export function buildOrderPositions(
  tickets: { itemId: number; quantity: number }[],
  priceById: Map<number, number>,
  attendee: { firstName: string; lastName: string; email: string },
): { positions: OrderPositionInput[]; totalCents: number } {
  const attendeeName = `${attendee.firstName} ${attendee.lastName}`.trim();
  const positions: OrderPositionInput[] = [];
  let totalCents = 0;
  for (const sel of tickets) {
    const price = priceById.get(sel.itemId) ?? 0;
    for (let n = 0; n < sel.quantity; n++) {
      positions.push({
        item: sel.itemId,
        price: centsToPrice(price),
        ...(attendeeName ? { attendee_name: attendeeName } : {}),
        attendee_email: attendee.email,
      });
      totalCents += price;
    }
  }
  return { positions, totalCents };
}
