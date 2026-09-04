import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import {
  signMagicLink,
  verifyMagicLink,
  verifyMagicLinkClaims,
} from "@/lib/tokens/magic-link";

beforeAll(() => {
  process.env.MAGIC_LINK_SECRET = "test-secret";
});

/**
 * Mint a token exactly the way the pre-revocation implementation did, without
 * going through signMagicLink. This is what the 394 live orders hold, so the
 * compatibility tests must not depend on the current signer to produce it.
 */
function legacyToken(orderCode: string): string {
  const secret = process.env.MAGIC_LINK_SECRET || "dev-secret";
  const b64url = (input: Buffer | string) =>
    Buffer.from(input)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const p = b64url(orderCode);
  return `${p}.${b64url(createHmac("sha256", secret).update(p).digest())}`;
}

describe("magic-link", () => {
  it("round-trips an order code", () => {
    const token = signMagicLink("ABC12");
    expect(token).toContain(".");
    expect(verifyMagicLink(token)).toBe("ABC12");
  });

  it("rejects a tampered token", () => {
    const token = signMagicLink("ABC12");
    const tampered = token.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect(verifyMagicLink(tampered)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyMagicLink("garbage")).toBeNull();
  });
});

describe("magic-link legacy compatibility", () => {
  it("still verifies a token minted in the old two-part format", () => {
    // The regression that would brick live tickets: this must never return null.
    expect(verifyMagicLink(legacyToken("ABC12"))).toBe("ABC12");
  });

  it("keeps emitting the legacy format when no options are passed", () => {
    // New orders must produce byte-identical links to the historical signer, so
    // nothing about the live registration flow changes.
    expect(signMagicLink("ABC12")).toBe(legacyToken("ABC12"));
  });

  it("decodes a legacy token as version 0 with no expiry", () => {
    const claims = verifyMagicLinkClaims(legacyToken("ABC12"));
    expect(claims).toEqual({ code: "ABC12", version: 0 });
  });
});

describe("magic-link versioned format", () => {
  it("round-trips an order code and its version", () => {
    const token = signMagicLink("ABC12", { version: 3 });
    expect(token.startsWith("v2.")).toBe(true);
    expect(verifyMagicLinkClaims(token)).toEqual({
      code: "ABC12",
      version: 3,
      exp: undefined,
    });
  });

  it("rejects a tampered versioned token", () => {
    const token = signMagicLink("ABC12", { version: 3 });
    const tampered = token.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect(verifyMagicLinkClaims(tampered)).toBeNull();
  });

  it("reports the version a revoked link was issued at, so lookup can reject it", () => {
    // Revocation is enforced against the order row: the order's magicLinkVersion
    // has moved on, and the stale claim below is what getOrderByToken compares.
    const stale = signMagicLink("ABC12", { version: 1 });
    const orderVersion = 2;
    expect(verifyMagicLinkClaims(stale)!.version).not.toBe(orderVersion);
  });

  it("never expires by default", () => {
    const token = signMagicLink("ABC12", { version: 1 });
    expect(verifyMagicLinkClaims(token)!.exp).toBeUndefined();
  });

  it("honours an opt-in expiry that is still in the future", () => {
    const token = signMagicLink("ABC12", { version: 1, expiresInSeconds: 3600 });
    expect(verifyMagicLink(token)).toBe("ABC12");
  });

  it("rejects a token whose opt-in expiry has passed", () => {
    const token = signMagicLink("ABC12", { version: 1, expiresInSeconds: -3600 });
    expect(verifyMagicLink(token)).toBeNull();
  });

  it("uses the versioned format when only an expiry is requested", () => {
    // version defaults to 0, but an expiry claim has nowhere to live in the
    // legacy format, so the signer must upgrade the shape.
    const token = signMagicLink("ABC12", { expiresInSeconds: 3600 });
    expect(token.startsWith("v2.")).toBe(true);
    expect(verifyMagicLinkClaims(token)!.version).toBe(0);
  });
});
