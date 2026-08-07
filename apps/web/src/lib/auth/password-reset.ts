import { prisma } from "@/lib/db/client";
import { hashPassword } from "./password";
import { generateResetToken, hashResetToken } from "@/lib/tokens/reset-token";
import { sendEmail } from "@/lib/email/service";
import { passwordResetEmail, type Locale } from "@/lib/email/templates";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MIN_PASSWORD = 8;

/**
 * Begin a password reset. ALWAYS resolves the same way whether or not the email
 * exists (no account enumeration). Only when an active user matches do we mint a
 * single-use, 1-hour, SHA-256-hashed token and email the link.
 */
export async function requestPasswordReset(email: string, locale: Locale = "en"): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.status === "suspended") return; // neutral: no token, no email

  const { token, tokenHash } = generateResetToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TTL_MS) },
  });

  const url = `${process.env.APP_URL ?? ""}/${locale}/reset-password?token=${token}`;
  await sendEmail(
    { to: user.email, ...passwordResetEmail(locale, url) },
    { templateType: "password_reset", organizationId: null, attendeeRef: user.id },
  );
}

export interface ResetResult {
  ok: boolean;
  error?: string;
}

/**
 * Complete a reset: validate the hashed token (exists, unused, unexpired), claim
 * it with an atomic compare-and-set, then set a new argon2id password hash.
 * The claim — not the read — is what makes the token genuinely single-use.
 */
export async function resetPassword(token: string, newPassword: string): Promise<ResetResult> {
  if (!token) return { ok: false, error: "Invalid or expired reset link." };
  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  const tokenHash = hashResetToken(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  // Hash BEFORE claiming. argon2id is deliberately slow (~100ms+); doing it after
  // the claim would leave the token burned for that whole window if hashing threw.
  const passwordHash = await hashPassword(newPassword);

  // Single-use enforcement is this ATOMIC compare-and-set, not the read above —
  // the read only yields a fast, friendly error. Two concurrent posts carrying
  // the same token both pass the read; only one wins this claim. Expiry is
  // re-checked in the same WHERE so a token cannot be claimed after it lapses.
  // (Same shape as the invite claim in lib/registration/service.ts.)
  const now = new Date();
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  // Deliberately NO release-on-failure helper here, unlike the invite claim: that
  // one brackets a remote pretix call that fails on its own, and it has a
  // redeemedOrderCode marker that makes releasing provably safe. Here the only
  // remaining step is a local write on the same database — if it fails, the
  // release would almost certainly fail too — and un-setting usedAt would reopen
  // the exact race this claim closes. Burning the token is the fail-closed
  // choice: the old password still works and a fresh link is one click away.
  await prisma.$transaction([
    // Bumping sessionVersion is what actually evicts an attacker: with JWT
    // sessions there is nothing to delete server-side, so rotating the hash
    // alone lets a stolen token keep working until it expires on its own.
    // getSessionContext() refuses any token carrying the pre-reset value.
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
  ]);
  return { ok: true };
}
