import { prisma } from "@/lib/db/client";
import { signMagicLink, verifyMagicLinkClaims } from "@/lib/tokens/magic-link";

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
  const claims = verifyMagicLinkClaims(token);
  if (!claims) return null;

  const order = await getOrderByCode(claims.code);
  if (!order) return null;

  // A valid signature only proves we minted the link, never that it is still
  // meant to open. A forwarded ticket email otherwise grants permanent access
  // to the order's PII and QR. These two row checks are the kill switch, and
  // neither one cancels the registration or the pretix order behind it.
  if (order.magicLinkRevokedAt) return null;
  if (claims.version !== order.magicLinkVersion) return null;

  return order;
}

/**
 * Kill a leaked ticket link without touching the registration.
 *
 * The attendee keeps their order, seat, approval state and QR — only the URL
 * stops resolving. Call rotateOrderMagicLink afterwards to hand them a working
 * link again. Returns false when no such order exists.
 */
export async function revokeOrderMagicLink(orderCode: string): Promise<boolean> {
  const order = await getOrderByCode(orderCode);
  if (!order) return false;

  await prisma.attendeeOrder.update({
    where: { id: order.id },
    data: { magicLinkRevokedAt: new Date() },
  });
  return true;
}

/**
 * Issue a fresh link for an order and invalidate every link mailed before it.
 *
 * Bumping magicLinkVersion is what actually breaks the old token: re-signing on
 * its own would not, because a legacy token is a pure function of the order
 * code and the secret, so it would come back byte-identical. Clearing
 * magicLinkRevokedAt is what makes this the "un-revoke" path too.
 *
 * Returns the new token (which the caller is responsible for delivering), or
 * null when no such order exists.
 */
export async function rotateOrderMagicLink(
  orderCode: string,
  opts: { expiresInSeconds?: number } = {},
): Promise<string | null> {
  const order = await getOrderByCode(orderCode);
  if (!order) return null;

  const version = order.magicLinkVersion + 1;
  const magicLinkToken = signMagicLink(orderCode, {
    version,
    expiresInSeconds: opts.expiresInSeconds,
  });

  await prisma.attendeeOrder.update({
    where: { id: order.id },
    data: { magicLinkToken, magicLinkVersion: version, magicLinkRevokedAt: null },
  });
  return magicLinkToken;
}
