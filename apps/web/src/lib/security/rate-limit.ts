interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

export interface RateResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Generic in-memory fixed-window rate limiter, keyed by an arbitrary string
 * (IP, email, etc.). Single-instance only — pair with edge/CDN/nginx limits and
 * swap for Redis to scale horizontally.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateResult {
  const w = store.get(key);
  if (!w || now >= w.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  w.count += 1;
  return { allowed: w.count <= limit, remaining: Math.max(0, limit - w.count), resetAt: w.resetAt };
}

/** Test/ops helper: clear all rate-limit windows. */
export function __resetRateLimits() {
  store.clear();
}
