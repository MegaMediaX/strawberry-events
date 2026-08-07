import type { RegisterResult } from "./service";

/**
 * Where to send a registrant immediately after `register()` commits.
 *
 * An issued ticket must land on the HMAC-signed magic-link path, because that
 * is the only surface allowed to render the pretix secret QR (see
 * `shouldShowTicketQr`). Routing "you're in" to the order-code-addressed
 * confirmation page would put a scannable ticket behind a five-character,
 * guessable URL.
 *
 * The other two states carry no secret, so they keep their order-code URLs —
 * which also keeps the links already sitting in attendees' inboxes valid.
 *
 * Pure and Prisma-free so the routing decision is unit-testable without a DB.
 */
export function postRegisterPath(
  locale: string,
  slug: string,
  result: Pick<RegisterResult, "orderCode" | "status" | "approvalStatus" | "magicLinkToken">,
): string {
  // Approval is checked first to mirror registrationState(): a held order is
  // "pending approval" even when it was created as paid, and has no ticket yet.
  if (result.approvalStatus === "pending") {
    return `/${locale}/events/${slug}/confirmation/${result.orderCode}`;
  }
  if (result.status === "paid") {
    return `/${locale}/t/${result.magicLinkToken}`;
  }
  return `/${locale}/events/${slug}/payment-pending/${result.orderCode}`;
}
