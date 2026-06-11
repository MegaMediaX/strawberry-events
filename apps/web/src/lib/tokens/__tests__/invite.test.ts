import { describe, it, expect, beforeEach } from "vitest";
import { signInvite, verifyInvite } from "../invite";

beforeEach(() => {
  process.env.WEBHOOK_SECRET = "test-secret";
});

describe("signInvite / verifyInvite", () => {
  it("round-trips a full payload", () => {
    const payload = { ev: "expo-2026", items: [7, 8], tag: "media" as const, exp: undefined };
    const token = signInvite(payload);
    const result = verifyInvite(token);
    expect(result).not.toBeNull();
    expect(result!.ev).toBe("expo-2026");
    expect(result!.items).toEqual([7, 8]);
    expect(result!.tag).toBe("media");
  });

  it("returns null for a tampered body", () => {
    const token = signInvite({ ev: "expo", items: [1] });
    // flip a char in the body part
    const tampered = "X" + token.slice(1);
    expect(verifyInvite(tampered)).toBeNull();
  });

  it("returns null for a tampered signature", () => {
    const token = signInvite({ ev: "expo", items: [1] });
    const dot = token.lastIndexOf(".");
    const badSig = token.slice(dot + 1).split("").reverse().join("");
    expect(verifyInvite(token.slice(0, dot + 1) + badSig)).toBeNull();
  });

  it("returns null for a token with no dot", () => {
    expect(verifyInvite("nodothere")).toBeNull();
  });

  it("returns null when exp is in the past", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = signInvite({ ev: "expo", items: [1], exp: past });
    expect(verifyInvite(token)).toBeNull();
  });

  it("returns payload when exp is in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = signInvite({ ev: "expo", items: [1], exp: future });
    expect(verifyInvite(token)).not.toBeNull();
  });

  it("returns payload when exp is absent (never expires)", () => {
    const token = signInvite({ ev: "expo", items: [5] });
    expect(verifyInvite(token)).not.toBeNull();
  });

  it("preserves optional email field for Phase B", () => {
    const token = signInvite({ ev: "expo", items: [1], email: "user@example.com" });
    const result = verifyInvite(token);
    expect(result!.email).toBe("user@example.com");
  });
});
