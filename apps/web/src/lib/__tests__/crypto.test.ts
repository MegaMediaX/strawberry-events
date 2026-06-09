import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const enc = encrypt("tok_secret");
    expect(enc).not.toContain("tok_secret");
    expect(decrypt(enc)).toBe("tok_secret");
  });

  it("produces distinct ciphertexts for the same input (random IV)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("throws on tampered ciphertext", () => {
    const enc = encrypt("hello");
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });
});
