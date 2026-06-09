import { describe, it, expect, beforeAll } from "vitest";
import { signMagicLink, verifyMagicLink } from "@/lib/tokens/magic-link";

beforeAll(() => {
  process.env.WEBHOOK_SECRET = "test-secret";
});

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
