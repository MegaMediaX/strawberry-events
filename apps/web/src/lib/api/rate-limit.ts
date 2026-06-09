interface Window {
  count: number;
  resetAt: number; // epoch ms
}

const WINDOW_MS = 60_000;
const store = new Map<string, Window>();

export interface RateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter, keyed per API key. Single-instance only
 * (documented); swap for Redis to scale horizontally.
 */
export function checkRateLimit(keyId: string, limit: number, now: number = Date.now()): RateResult {
  const w = store.get(keyId);
  if (!w || now >= w.resetAt) {
    const resetAt = now + WINDOW_MS;
    store.set(keyId, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }
  w.count += 1;
  const remaining = Math.max(0, limit - w.count);
  return { allowed: w.count <= limit, limit, remaining, resetAt: w.resetAt };
}

/** Test helper: clear all windows. */
export function __resetRateLimit() {
  store.clear();
}
