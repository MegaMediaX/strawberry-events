import { randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const CODE_LENGTH = 6;

/**
 * A six-digit code, uniformly distributed, from the CSPRNG.
 *
 * `randomInt` and not `Math.random()`: this is the only thing standing between
 * a stranger and a verified claim on someone's address. Leading zeros are kept
 * — "042318" is a valid code, and trimming it would quietly shrink the space.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * argon2id, deliberately — see the note on `EmailVerificationCode.codeHash`.
 * A six-digit code has 10^6 possibilities, so a fast hash is recovered offline
 * the instant the table leaks, and nothing here needs a deterministic lookup:
 * codes are found by `email`, never by the code.
 */
export function hashCode(code: string): Promise<string> {
  return hashPassword(code);
}

export function verifyCode(hashed: string, code: string): Promise<boolean> {
  return verifyPassword(hashed, code);
}
