import { randomInt } from "node:crypto";

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
 *
 * Uses the CSPRNG, NOT `Math.random()`. This slug is the only thing gating an
 * unauthenticated page that discloses an attendee's name, company and role, and
 * it is also accepted as a check-in code. V8's `Math.random()` is xorshift128+,
 * whose internal state is recoverable from observed output — after which every
 * later slug is predictable. That risk grows with process uptime, and this
 * server mints slugs continuously across a three-day event.
 *
 * `randomInt(n)` is uniform over [0, n) with rejection sampling, so there is no
 * modulo bias. The seam stays injectable for tests.
 */
export function generateBadgeSlug(
  randomIndex: (bound: number) => number = randomInt,
): string {
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    out += ALPHABET[randomIndex(ALPHABET.length)];
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

/**
 * Longest payload whose QR still fits the box `badge-zpl.ts` reserves for it.
 *
 * The printer picks the QR version from the actual data at print time, but the
 * label geometry is computed for a fixed 29-module (version 3) symbol. Exceed
 * this and the printer draws a LARGER symbol into the same reserved box, which
 * eats the quiet zone and stops badges scanning — the exact defect this feature
 * already shipped once and had to fix on real hardware.
 *
 * 48 characters is `HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345`, the
 * default host. A longer host must be paired with new geometry.
 */
export const MAX_BADGE_PAYLOAD_LENGTH = 48;

/** The exact string encoded into the badge QR. */
export function badgeProfileUrl(slug: string): string {
  const url = `HTTPS://${profileHost()}/C/${slug}`;

  // Fail loudly at the call site rather than silently printing 812 unscannable
  // badges. NEXT_PUBLIC_BADGE_PROFILE_HOST is deployment config, so this can
  // only trip on a misconfiguration, and it trips on the very first badge.
  if (url.length > MAX_BADGE_PAYLOAD_LENGTH) {
    throw new Error(
      `Badge QR payload is ${url.length} chars, over the ${MAX_BADGE_PAYLOAD_LENGTH} the label geometry ` +
        `reserves. Shorten NEXT_PUBLIC_BADGE_PROFILE_HOST or recompute the QR box in badge-zpl.ts.`,
    );
  }
  return url;
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
