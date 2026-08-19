/**
 * The opaque code carried in the badge QR, and the URL built around it.
 *
 * Two rules shape this file:
 *
 * 1. The slug is STORED, never derived. A slug computed from the order would
 *    change whenever its inputs changed, silently 404-ing every badge already
 *    printed and worn. `attendee_orders.badgeSlug` is written once.
 *
 * 2. The payload is UPPERCASE. A QR encoder picks alphanumeric mode only when
 *    every character is in `0-9 A-Z $%*+-./: and space`; one lowercase letter
 *    forces byte mode, which is ~31% less dense and pushes the symbol past the
 *    room available under the role band. Hence HTTPS:// and an uppercase host —
 *    scheme and host are case-insensitive per RFC 3986, so this is a legal URL.
 *    The PATH is not case-insensitive, which is why `resolveBadgeSlug`
 *    upper-cases before lookup and why the alphabet excludes lowercase.
 */

/**
 * Crockford base32 without I, L, O and U. The first three misread against each
 * other on a thermal badge — this is a fallback someone may end up typing — and
 * U is dropped so the generator cannot spell an unfortunate word.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SLUG_LENGTH = 8;

/** Matches a stored slug. Anchored: a partial match must not resolve. */
const SLUG_RE = new RegExp(`^[${ALPHABET}]{${SLUG_LENGTH}}$`);

export function isBadgeSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

/**
 * ~40 bits. Over 812 badges the birthday collision probability is ~3e-7, and
 * the unique index turns even that into a retryable write rather than two
 * attendees sharing a profile.
 */
export function generateBadgeSlug(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Host for the printed payload, uppercased. Read from env so a staging print
 * run cannot bake production URLs into physical badges.
 */
function profileHost(): string {
  const raw = process.env.NEXT_PUBLIC_BADGE_PROFILE_HOST?.trim();
  return (raw && raw.length > 0 ? raw : "register.strawberryagency.com").toUpperCase();
}

/** The exact string encoded into the badge QR. */
export function badgeProfileUrl(slug: string): string {
  return `HTTPS://${profileHost()}/C/${slug}`;
}

/**
 * Pull a slug out of whatever a scanner hands us, or return null.
 *
 * This is the Day-2 path. Door staff scan the badge to check someone in, and
 * from now on the badge QR holds a profile URL rather than the pretix secret.
 * Without this the second morning fails closed for every attendee whose badge
 * was printed on the first — so `checkInBySecret` runs its input through here
 * before deciding it does not recognise the code.
 *
 * Deliberately permissive about the wrapper and strict about the slug: scanners
 * differ over whether they emit the scheme, keyboard-wedge models sometimes
 * append a newline, and the case that comes back depends on the model. What it
 * will not do is treat an arbitrary string as a slug — the shape is checked.
 */
export function resolveBadgeSlug(scanned: string): string | null {
  const trimmed = scanned.trim();
  if (!trimmed) return null;

  // A bare slug, typed or scanned from a code that carries only the id.
  const bare = trimmed.toUpperCase();
  if (isBadgeSlug(bare)) return bare;

  // Anything URL-shaped: take the last non-empty path segment after /c/.
  const match = /\/c\/([^/?#\s]+)/i.exec(trimmed);
  if (!match) return null;

  const candidate = match[1].toUpperCase();
  return isBadgeSlug(candidate) ? candidate : null;
}
