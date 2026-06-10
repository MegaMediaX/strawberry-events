import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (avoids timing oracles on secret checks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Length leak is acceptable; compare equal-length buffers in constant time.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
