import { prisma } from "@/lib/db/client";
import { generateCode, hashCode, verifyCode } from "@/lib/tokens/verification-code";
import { sendEmail } from "@/lib/email/service";
import { verifyEmailCodeEmail, type Locale } from "@/lib/email/templates";

const TTL_MS = 10 * 60 * 1000;

/**
 * Wrong guesses allowed against one code. Five, against a 10^6 space, over a
 * ten-minute life — and the counter lives in the row, not in the in-memory
 * limiter, because that map is wiped on every deploy and CI recreates the
 * container on every merge.
 */
export const MAX_ATTEMPTS = 5;

/**
 * One string for every failure: wrong code, expired code, no code, locked out,
 * address that never had one. Any distinction here would answer the question
 * `registerAttendee` refuses to answer, one step later in the same flow.
 */
export const CODE_REJECTED =
  "That code isn't right, or it's expired. Request a new one.";

export interface CheckResult {
  ok: boolean;
  error?: string;
}

export interface MintedCode {
  code: string;
  codeHash: string;
}

/**
 * Generate a code and hash it, WITHOUT deciding whether it will be used.
 *
 * Split out from storing it so the caller can pay the argon2 cost on every
 * path. `registerAttendee` mints one whether or not it goes on to create an
 * account, for the same reason it hashes the password either way: a ~20ms
 * branch-dependent cost is a timing oracle, and the whole point of that flow is
 * that the two branches are indistinguishable.
 */
export async function mintCode(): Promise<MintedCode> {
  const code = generateCode();
  return { code, codeHash: await hashCode(code) };
}

/**
 * Store a minted code against an address and mail it.
 *
 * Any previous live code for the same address is superseded first, so exactly
 * one is ever valid: without that, a resend would leave the earlier code
 * working and quietly multiply the guessing surface with every click.
 */
export async function storeAndSendCode(
  userId: string,
  email: string,
  minted: MintedCode,
  locale: Locale = "en",
): Promise<void> {
  const e = email.toLowerCase().trim();

  await prisma.emailVerificationCode.updateMany({
    where: { email: e, usedAt: null, supersededAt: null },
    data: { supersededAt: new Date() },
  });

  await prisma.emailVerificationCode.create({
    data: {
      userId,
      email: e,
      codeHash: minted.codeHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  await sendEmail(
    { to: e, ...verifyEmailCodeEmail(locale, minted.code) },
    { templateType: "email_verification", organizationId: null, attendeeRef: e },
  );
}

/**
 * Check a submitted code and, on success, mark the address verified.
 *
 * Looked up by ADDRESS, not by code — the caller was deliberately told nothing
 * about whether an account exists, so it has no userId to offer, and a lookup
 * keyed on the code itself would let anyone probe the whole live code space
 * across all accounts at once.
 */
export async function checkVerificationCode(
  email: string,
  code: string,
): Promise<CheckResult> {
  const e = email.toLowerCase().trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: CODE_REJECTED };

  const row = await prisma.emailVerificationCode.findFirst({
    where: {
      email: e,
      usedAt: null,
      supersededAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: CODE_REJECTED };

  if (!(await verifyCode(row.codeHash, code))) {
    // Count the miss before answering, so a burst of parallel guesses cannot
    // outrun the counter.
    await prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: CODE_REJECTED };
  }

  // The CLAIM is what makes the code single-use, not the read above: two
  // requests carrying the same correct code can both reach here, and only one
  // may win. Same compare-and-set `resetPassword` uses.
  const claimed = await prisma.emailVerificationCode.updateMany({
    where: {
      id: row.id,
      usedAt: null,
      supersededAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, error: CODE_REJECTED };

  await prisma.user.update({
    where: { id: row.userId },
    data: { emailVerified: new Date() },
  });

  return { ok: true };
}
