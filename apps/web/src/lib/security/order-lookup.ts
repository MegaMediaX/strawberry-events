import { clientIp } from "./client-ip";
import { rateLimit } from "./rate-limit";

/**
 * Public pages addressed by a pretix order code (confirmation, payment
 * pending) are unauthenticated by design — the attendee has nothing but the
 * code. Order codes are five characters over a 28-character alphabet, so the
 * whole space is ~17M and a single event's live codes are a few hundred of
 * them: unthrottled, an attacker can walk the space and harvest real orders.
 *
 * 20 lookups/minute/IP keeps a human (reload, back button, a couple of tabs)
 * comfortable while turning enumeration into days of traffic per source IP.
 */
export const ORDER_LOOKUP_LIMIT = 20;
export const ORDER_LOOKUP_WINDOW_MS = 60_000;

/**
 * The client IP comes from `./client-ip`, which reads the entries the trusted
 * proxies appended (the RIGHTMOST ones).
 *
 * This module used to carry its own `clientIp()` reading the LEFTMOST
 * `X-Forwarded-For` entry — the one the client supplies. That value is
 * attacker-controlled, so rotating it per request landed every request in a
 * fresh bucket and disabled this limiter entirely: the enumeration defence the
 * comment above describes was not running. `client-ip.ts` was written to kill
 * exactly that pattern and names the three duplicated helpers it replaced;
 * this one was missed because it lives beside it rather than in a route.
 *
 * There must be one definition. Do not reintroduce a local copy.
 */

/** Namespaced so one event's traffic cannot exhaust another event's budget. */
export function orderLookupKey(scope: string, ip: string): string {
  return `order-lookup:${scope}:${ip}`;
}

/**
 * Gate an order-code lookup. Call BEFORE the database read so a throttled
 * request never distinguishes an existing order from a missing one.
 *
 * In-memory and single-instance (see rate-limit.ts) — this is defense in depth
 * behind the edge/CDN/nginx limits, not a substitute for them.
 */
export async function allowOrderCodeLookup(scope: string): Promise<boolean> {
  const ip = await clientIp();
  return rateLimit(
    orderLookupKey(scope, ip),
    ORDER_LOOKUP_LIMIT,
    ORDER_LOOKUP_WINDOW_MS,
  ).allowed;
}
