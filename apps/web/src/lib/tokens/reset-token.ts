import { randomBytes, createHash } from "node:crypto";

/**
 * Password-reset tokens are high-entropy random values, so a fast deterministic
 * hash (SHA-256) is the correct primitive: it allows a unique-index equality
 * lookup while ensuring a DB breach yields no usable reset link (the plaintext
 * exists only in the emailed URL, in transit). argon2 is for low-entropy
 * passwords and is non-deterministic, so it cannot back an indexed lookup.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a fresh reset token: the plaintext (for the email link) + its hash. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}
