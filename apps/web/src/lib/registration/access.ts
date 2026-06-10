import { prisma } from "@/lib/db/client";
import { verifyMagicLink } from "@/lib/tokens/magic-link";

/**
 * Look up an attendee order by its order code.
 *
 * Order codes are low-entropy and shareable, so callers that have the event
 * slug in scope (the public confirmation / payment-pending pages) MUST pass it
 * as `pretixEventSlug` to prevent a horizontal IDOR — otherwise one event's URL
 * could surface another attendee's PII and a working magic-link token. The
 * slug-free form is reserved for the HMAC-signed magic-link path (`/t/[token]`).
 */
export async function getOrderByCode(orderCode: string, pretixEventSlug?: string) {
  return prisma.attendeeOrder.findFirst({
    where: {
      orderCode,
      ...(pretixEventSlug ? { eventMapping: { pretixEventSlug } } : {}),
    },
    include: { eventMapping: true },
  });
}

export async function getOrderByToken(token: string) {
  const code = verifyMagicLink(token);
  if (!code) return null;
  return getOrderByCode(code);
}
