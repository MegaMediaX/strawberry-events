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
  // A BARE slug must carry BOTH a letter and a digit.
  //
  // The letter, because the alphabet includes every digit: "70123456" — an
  // ordinary Lebanese mobile — is a valid 8-character slug by shape, and
  // treating it as one would send phone searches to the scan path and lose the
  // attendee. Measured on production: 0 of 844 real slugs are all-digits
  // (chance is ~1 in 10,700), while 932 attendees have an 8-digit phone.
  //
  // The digit, because the alphabet drops exactly I, L, O and U — so ordinary
  // eight-letter names are valid slugs by shape. SAMANTHA, MARGARET, STEPHANE
  // and JEANETTE all pass SLUG_RE. Treating those as codes meant the door
  // never searched for them: it offered to REGISTER a woman standing in front
  // of the operator who was already registered, which is the duplicate the
  // whole screen is built to avoid, and Enter refused her ticket with "QR not
  // recognized". A digit costs the ~1-in-8 real slug that happens to have none
  // (0.6875^8), and that case is recovered by `decideEnter` below: it is
  // searched first and falls through to the scanner once the search answers
  // with nobody. A name never gets that far, because a registered attendee is
  // found.
  //
  // The URL form is unaffected by both rules, because /c/ says what it is.
  if (SLUG_RE.test(t.toUpperCase()) && /[A-Z]/i.test(t) && /[0-9]/.test(t)) return true;
  if (PRETIX_SECRET_RE.test(t)) return true;
  // Any URL, or anything carrying a /c/ path segment — resolveBadgeSlug does
  // the real extraction server-side; this only decides where to send it.
  return /^https?:\/\//i.test(t) || /\/c\/[^/?#\s]+/i.test(t);
}

/**
 * Slug-shaped, but not conclusively a code.
 *
 * `looksScannable` requires a digit precisely so an eight-letter name is not
 * mistaken for one, which leaves the digitless slug — roughly one in eight —
 * looking exactly like a name. This recognises that shape so Enter can fall
 * back to the scanner AFTER a search has answered with nobody, which is the
 * one moment the ambiguity is resolved: a name that belongs to someone here
 * matches a row, and a slug matches nothing.
 */
export function couldBeBareSlug(value: string): boolean {
  const t = value.trim();
  return SLUG_RE.test(t.toUpperCase()) && /[A-Z]/i.test(t);
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

  // Nothing matched, and the text has a slug's shape without a slug's digit.
  // The search has ANSWERED for exactly this text (rowsQuery) and found
  // nobody, so it is not the name of anyone at this event — send it to the
  // scanner, which is where a badge code belongs. Gated on the answered query
  // for the same reason the branch above is: acting on rows that answer an
  // older question is how the wrong person gets admitted.
  if (couldBeBareSlug(t) && rowsQuery.trim() === t && rows.length === 0) {
    return { kind: "scan", text: t };
  }

  // Several, none, or results that answer a different question. Never guess:
  // Enter has to be safe to lean on all day.
  return { kind: "none" };
}
