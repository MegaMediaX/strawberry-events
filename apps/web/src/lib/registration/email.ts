/**
 * The one shape check for an attendee email address.
 *
 * Deliberately permissive — it rejects typos of structure, not of spelling, and
 * anything stricter starts refusing addresses that genuinely deliver. It lives
 * here rather than inline in the schema because the wizard has to apply the
 * same rule at step one: the ticket QR is only ever reachable through the magic
 * link sent to this address, so an address that fails here must fail before the
 * attendee has filled in four steps behind it.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
