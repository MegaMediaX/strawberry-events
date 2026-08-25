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

/** What pressing Enter in the door's search box should do. */
export type EnterAction =
  | { kind: "scan"; text: string }
  | { kind: "checkIn"; orderCode: string }
  | { kind: "none" };

/**
 * Decide what Enter does, as a pure function of what is on screen.
 *
 * Extracted deliberately. This is the most dangerous branch on the check-in
 * screen — it can admit a person and print a badge, and neither is undoable —
 * and there is no component-testing library in this repo, so left inside the
 * component it had no coverage at all. Here it is exhaustively testable.
 *
 * `rowsQuery` is the query the rows actually answer. It is NOT decoration:
 * results are written only when the 220ms search debounce resolves, so for a
 * moment after every keystroke `rows` still holds the previous query's answer.
 * Without this check, typing "Elias", waiting for one match, then typing
 * "Elias D" to disambiguate a second Elias and pressing Enter checks in the
 * FIRST one.
 */
export function decideEnter(
  text: string,
  rowsQuery: string,
  rows: readonly { orderCode: string }[],
): EnterAction {
  const t = text.trim();
  if (!t) return { kind: "none" };

  // A code is never a query. Route it exactly where the camera's output goes.
  if (looksScannable(t)) return { kind: "scan", text: t };

  // Exactly one match FOR WHAT IS CURRENTLY TYPED.
  if (rowsQuery.trim() === t && rows.length === 1) {
    return { kind: "checkIn", orderCode: rows[0].orderCode };
  }

  // Several, none, or results that answer a different question. Never guess:
  // Enter has to be safe to lean on all day.
  return { kind: "none" };
}
