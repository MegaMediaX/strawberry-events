import type { RegistrationState } from "@/lib/approval/state";

/**
 * Whether the attendee view may render the scannable ticket QR.
 *
 * The QR encodes the real pretix position secret — a working entrance pass, not
 * a display code. pretix order codes are five characters over a 28-character
 * alphabet (~17M combinations) and event slugs are published on the storefront,
 * so any page addressed by order code alone is enumerable: on a 300-order event
 * roughly 57k requests are expected to land on a live order. Releasing the
 * secret there turns a guessed string into a free ticket.
 *
 * The secret is therefore only released on the HMAC-signed magic-link path
 * (`/[locale]/t/[token]`), whose token cannot be forged without
 * MAGIC_LINK_SECRET. `canReveal` is the caller's authorization decision and is
 * false by default at every call site, so a route that forgets to opt in fails
 * closed and shows status only.
 */
export function shouldShowTicketQr(
  state: RegistrationState,
  canReveal: boolean,
): boolean {
  return canReveal && state === "issued";
}

/**
 * Whether to offer the "email me my ticket link" recovery affordance.
 *
 * Only meaningful when a ticket actually exists but this surface is not allowed
 * to show it — i.e. someone landed on the order-code-addressed confirmation
 * page. Sending the signed link to the address already on the order is the safe
 * recovery path: it moves the secret to a channel the requester must already
 * control, instead of handing it to whoever typed the URL.
 */
export function shouldOfferTicketRecovery(
  state: RegistrationState,
  canReveal: boolean,
): boolean {
  return state === "issued" && !canReveal;
}
