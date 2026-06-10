import { describe, it, expect } from "vitest";
import { hashResetToken, generateResetToken } from "@/lib/tokens/reset-token";

describe("reset-token", () => {
  it("hashes deterministically (same input → same hash)", () => {
    expect(hashResetToken("abc")).toBe(hashResetToken("abc"));
    expect(hashResetToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("different tokens → different hashes", () => {
    expect(hashResetToken("abc")).not.toBe(hashResetToken("abd"));
  });
  it("generate returns a token and its matching hash; never stores plaintext", () => {
    const { token, tokenHash } = generateResetToken();
    expect(token.length).toBeGreaterThan(20);
    expect(tokenHash).toBe(hashResetToken(token));
    expect(tokenHash).not.toContain(token);
  });
  it("generates unique tokens", () => {
    expect(generateResetToken().token).not.toBe(generateResetToken().token);
  });
});
