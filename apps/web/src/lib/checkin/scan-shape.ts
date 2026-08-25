/**
 * Payload-shape tests for the check-in input, safe to run in the browser.
 *
 * `badge-slug.ts` imports `node:crypto` to mint slugs, so it cannot be pulled
 * into a client component. The alphabet lives here and badge-slug imports it,
 * so there is still exactly one definition of what a slug looks like.
 */

/** No lowercase, and no I/L/O/U — the shapes a tired operator mistypes. */
export const SLUG_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SLUG_LENGTH = 8;
export const SLUG_RE = new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`);

/**
 * A pretix position secret: long, lowercase alphanumeric. Deliberately loose —
 * being wrong here costs one failed scan, while being too strict costs a
 * working e-ticket that the door refuses to read.
 */
const PRETIX_SECRET_RE = /^[a-z0-9]{16,}$/;

/**
 * Is this text a CODE rather than something someone typed to search?
 *
 * A keyboard-wedge scanner is just a keyboard: its payload lands in whatever
 * field has focus, which at a door is the search box. Without this the badge
 * URL is searched as if it were a name — and because the slug alphabet is a
 * third digits, that used to match strangers by phone on a third of all scans.
 *
 * Recognises the three things that can arrive: a bare slug, a badge profile
 * URL, and a pretix e-ticket secret.
 */
export function looksScannable(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  // A BARE slug must contain a letter. The alphabet includes every digit, so
  // "70123456" — an ordinary Lebanese mobile — is a valid 8-character slug by
  // shape, and treating it as one would send phone searches to the scan path
  // and lose the attendee. Measured on production: 0 of 844 real slugs are
  // all-digits (chance is ~1 in 10,700), while 932 attendees have an 8-digit
  // phone. The URL form below is unaffected, because /c/ says what it is.
  if (SLUG_RE.test(t.toUpperCase()) && /[A-Z]/i.test(t)) return true;
  if (PRETIX_SECRET_RE.test(t)) return true;
  // Any URL, or anything carrying a /c/ path segment — resolveBadgeSlug does
  // the real extraction server-side; this only decides where to send it.
  return /^https?:\/\//i.test(t) || /\/c\/[^/?#\s]+/i.test(t);
}
