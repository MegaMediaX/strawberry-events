import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, createVerify, constants } from "node:crypto";

import {
  signForQz,
  qzCertificate,
  qzSigningConfigured,
  QzSigningUnavailable,
} from "@/lib/checkin/qz-signing";

// A throwaway keypair, so the tests never depend on the real one.
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env.QZ_PRIVATE_KEY = privateKey;
  process.env.QZ_CERTIFICATE = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("signForQz", () => {
  it("produces a signature that verifies against the public key", () => {
    // The point of the whole feature: QZ must be able to verify what we signed.
    // Anything less and it silently falls back to prompting.
    const challenge = "qz-tray-challenge-12345";
    const signature = signForQz(challenge);

    const verifier = createVerify("RSA-SHA512");
    verifier.update(challenge, "utf8");
    verifier.end();
    expect(
      verifier.verify({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, signature, "base64"),
    ).toBe(true);
  });

  it("does not verify against a different payload", () => {
    const signature = signForQz("the real challenge");
    const verifier = createVerify("RSA-SHA512");
    verifier.update("a different challenge", "utf8");
    verifier.end();
    expect(
      verifier.verify({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, signature, "base64"),
    ).toBe(false);
  });

  it("restores a key stored with escaped newlines", () => {
    // Some deployment paths cannot carry real newlines in an env var.
    process.env.QZ_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
    expect(() => signForQz("x")).not.toThrow();
  });

  it("refuses an empty challenge", () => {
    expect(() => signForQz("")).toThrow(/nothing to sign/i);
  });

  it("refuses an oversized payload", () => {
    // This endpoint is a signing oracle. It should not sign unbounded input.
    expect(() => signForQz("x".repeat(9000))).toThrow(/too large/i);
  });

  it("reports clearly when the key is missing", () => {
    delete process.env.QZ_PRIVATE_KEY;
    expect(() => signForQz("x")).toThrow(QzSigningUnavailable);
  });
});

describe("configuration reporting", () => {
  it("is configured only when BOTH halves are present", () => {
    expect(qzSigningConfigured()).toBe(true);

    delete process.env.QZ_CERTIFICATE;
    // A key without a certificate cannot work: QZ needs the cert to verify.
    expect(qzSigningConfigured()).toBe(false);

    process.env.QZ_CERTIFICATE = "cert";
    delete process.env.QZ_PRIVATE_KEY;
    expect(qzSigningConfigured()).toBe(false);
  });

  it("treats whitespace-only values as unconfigured", () => {
    process.env.QZ_PRIVATE_KEY = "   ";
    expect(qzSigningConfigured()).toBe(false);
  });

  it("returns the certificate verbatim", () => {
    expect(qzCertificate()).toContain("BEGIN CERTIFICATE");
  });
});
