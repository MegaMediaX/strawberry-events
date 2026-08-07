import { headers } from "next/headers";

/**
 * Client IP resolution for rate-limit keys.
 *
 * THE ATTACK THIS DEFENDS AGAINST (rate-limit key spoofing):
 * Every reverse proxy in front of this app (Traefik in production, the bundled
 * nginx via `$proxy_add_x_forwarded_for`) APPENDS the TCP peer it saw to any
 * client-supplied `X-Forwarded-For` header rather than replacing it. So the
 * header the app receives looks like:
 *
 *     X-Forwarded-For: <anything the attacker typed>, <real client IP>
 *                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
 *                       attacker-controlled          proxy-appended, trustworthy
 *
 * Reading the LEFTMOST entry — which is what the three duplicated `clientIp()`
 * helpers used to do — hands the attacker the rate-limit key. Rotating a random
 * value per request lands every request in a fresh bucket and disables the
 * registration, signup, and password-reset limits entirely. Only entries the
 * trusted proxies appended (the RIGHTMOST ones) may be used.
 */

/**
 * Number of trusted reverse proxies between the public internet and this app.
 * Default 1 == the production topology (Traefik -> next-app:3000) and plain
 * `docker compose up` (nginx -> next-app:3000). Zero configuration required;
 * ops only needs to touch this when stacking proxies (e.g. Traefik -> nginx ->
 * app, which is 2).
 */
const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Shared bucket for requests that carry no usable forwarding header. Kept
 * deliberately: a missing header means either local/direct container access or
 * a misconfigured proxy, and in both cases the request must still be limited.
 * Handing such requests a unique key (e.g. a random or per-request value) would
 * be an opt-out from rate limiting that anyone could trigger by stripping a
 * header, which is exactly the bypass this module exists to close. Fail closed:
 * these callers share one bucket.
 */
const UNKNOWN_IP = "unknown";

/** Longest textual IPv6 address (IPv4-mapped form, e.g. ::ffff:255.255.255.255 + zone). */
const MAX_IP_LENGTH = 45;

/**
 * Deliberately permissive shape check rather than a full IP parser: it is not a
 * security boundary (an attacker can always send well-formed IPs), it just stops
 * junk from becoming a rate-limit Map key — an unbounded attacker-supplied string
 * would otherwise be retained in memory for the whole window.
 */
const IP_SHAPE = /^[0-9A-Za-z.:%_-]+$/;

function parseTrustedProxyHops(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  // Anything unparseable, zero, or negative falls back to the safe default —
  // a bad env value must never degrade into "trust the leftmost entry".
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TRUSTED_PROXY_HOPS;
}

/** Normalize one forwarding-header entry, or null if it is not plausibly an address. */
function normalizeIp(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  // Some proxies emit bracketed IPv6, with or without a port: "[::1]" / "[::1]:5432".
  if (v.startsWith("[")) {
    const close = v.indexOf("]");
    if (close < 0) return null;
    v = v.slice(1, close);
  } else if (v.split(":").length === 2) {
    // Exactly one colon => "ipv4:port" (bare IPv6 always has 2+). Drop the port so
    // the same client does not get a new bucket per ephemeral source port.
    v = v.slice(0, v.indexOf(":"));
  }
  if (!v || v.length > MAX_IP_LENGTH || !IP_SHAPE.test(v)) return null;
  // Must look like an address, not a hostname/token.
  if (!v.includes(".") && !v.includes(":")) return null;
  return v.toLowerCase();
}

/**
 * Pure resolution logic, exported for tests: `get` is any case-insensitive
 * header lookup (Next's `headers()`, a `Request.headers`, …).
 */
export function resolveClientIp(
  get: (name: string) => string | null | undefined,
  hops: number = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
): string {
  // Preferred source: X-Real-IP is written by the single adjacent proxy straight
  // from the TCP peer (Traefik, and nginx's `X-Real-IP $remote_addr`), and both
  // OVERWRITE any client-supplied value — so it cannot be spoofed.
  // Only trustworthy with exactly one hop: with proxies stacked, the innermost
  // one overwrites X-Real-IP with the address of the proxy in front of it, which
  // would collapse every visitor on the internet into a single shared bucket.
  if (hops === 1) {
    const realIp = normalizeIp(get("x-real-ip"));
    if (realIp) return realIp;
  }

  const entries = (get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length === 0) return UNKNOWN_IP;

  // Each trusted proxy appended exactly one entry, so the real client sits `hops`
  // positions from the right. Everything to the LEFT of that is attacker-supplied
  // and must never be read. Clamping at 0 covers a chain shorter than configured
  // (an ops misconfiguration, not an attack path) instead of throwing.
  const index = Math.max(0, entries.length - hops);
  return normalizeIp(entries[index]) ?? UNKNOWN_IP;
}

/**
 * Rate-limit key for the current request's client. Shared by every server action
 * that rate-limits per IP — do not re-implement this inline, the leftmost-XFF
 * version is trivially bypassable.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return resolveClientIp((name) => h.get(name));
}
