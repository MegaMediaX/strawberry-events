import { describe, it, expect } from "vitest";
import {
  generateKey,
  hashKey,
  hashesEqual,
  isRevoked,
  isExpired,
  parseBearer,
} from "@/lib/api/keys";
import { hasScope, isScope, SCOPES } from "@/lib/api/scopes";

describe("api keys", () => {
  it("generates sk_strawberry_ key with matching hash + short prefix", () => {
    const k = generateKey();
    expect(k.raw.startsWith("sk_strawberry_")).toBe(true);
    expect(k.hash).toBe(hashKey(k.raw));
    expect(k.prefix.startsWith("sk_strawberry_")).toBe(true);
    expect(k.prefix.length).toBeLessThan(k.raw.length);
    expect(k.hash).not.toBe(k.raw); // stored hash is not the raw key
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashesEqual is true only for identical hashes", () => {
    const a = hashKey("sk_strawberry_aaa");
    expect(hashesEqual(a, hashKey("sk_strawberry_aaa"))).toBe(true);
    expect(hashesEqual(a, hashKey("sk_strawberry_bbb"))).toBe(false);
  });

  it("revoked / expired detection", () => {
    expect(isRevoked({ revokedAt: new Date() })).toBe(true);
    expect(isRevoked({ revokedAt: null })).toBe(false);
    const now = new Date("2026-06-09T00:00:00Z");
    expect(isExpired({ expiresAt: new Date("2026-06-08T00:00:00Z") }, now)).toBe(true);
    expect(isExpired({ expiresAt: new Date("2026-06-10T00:00:00Z") }, now)).toBe(false);
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
  });

  it("parseBearer extracts the key or null", () => {
    expect(parseBearer("Bearer sk_strawberry_abc-123_DEF")).toBe("sk_strawberry_abc-123_DEF");
    expect(parseBearer("sk_strawberry_abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer nope")).toBeNull();
  });
});

describe("scopes", () => {
  it("hasScope / isScope", () => {
    expect(hasScope(["events:read"], "events:read")).toBe(true);
    expect(hasScope(["events:read"], "attendees:write")).toBe(false);
    expect(isScope("orders:read")).toBe(true);
    expect(isScope("nope:read")).toBe(false);
    expect(SCOPES).toContain("webhooks:manage");
  });
});
