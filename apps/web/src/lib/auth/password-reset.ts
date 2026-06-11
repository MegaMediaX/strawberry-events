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
 * Complete a reset: validate the hashed token (exists, unused, unexpired), set a
 * new argon2id password hash, and mark the token used — atomically. Single-use.
 */
export async function resetPassword(token: string, newPassword: string): Promise<ResetResult> {
  if (!token) return { ok: false, error: "Invalid or expired reset link." };
  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  return { ok: true };
}
