import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "sk_strawberry_";
/** Characters of the random part kept in the stored display prefix. */
const PREFIX_VISIBLE = 4;

export interface GeneratedKey {
  raw: string;
  hash: string;
  prefix: string;
}

/** SHA-256 hex digest of a raw key. Only the hash is ever stored. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a new API key: returns the raw key (shown once), its hash, and a display prefix. */
export function generateKey(): GeneratedKey {
  const rand = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}${rand}`;
  return {
    raw,
    hash: hashKey(raw),
    prefix: `${KEY_PREFIX}${rand.slice(0, PREFIX_VISIBLE)}`,
  };
}

/** Constant-time comparison of two key hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isRevoked(key: { revokedAt: Date | null }): boolean {
  return key.revokedAt !== null;
}

export function isExpired(key: { expiresAt: Date | null }, now: Date = new Date()): boolean {
  return key.expiresAt !== null && key.expiresAt.getTime() < now.getTime();
}

/** Extract a raw key from an Authorization header (`Bearer sk_...`). */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(sk_strawberry_[A-Za-z0-9_-]+)$/.exec(header.trim());
  return m ? m[1] : null;
}
