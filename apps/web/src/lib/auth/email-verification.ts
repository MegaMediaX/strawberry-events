import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/security/rate-limit";
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

/**
 * Per-ADDRESS cap shared by every signup mail — the first code, the
 * "you already have an account" notice, and every resend.
 *
 * One budget on purpose: if resend had its own, it would be a way to mail
 * someone three more times per hour than signup allows, which is exactly the
 * mailbombing the cap exists to stop.
 */
export const MAIL_LIMIT = 3;
export const MAIL_WINDOW_MS = 60 * 60 * 1000;

export function signupMailAllowed(email: string): boolean {
  return rateLimit(`signup-mail:${email}`, MAIL_LIMIT, MAIL_WINDOW_MS).allowed;
}

/**
 * Issue a replacement code for an address that is waiting on one.
 *
 * This exists because re-running signup could not do it. The first submit
 * CREATES the account, so a second call finds it already present, takes the
 * existing-address branch, and mails "you already have an account" — no new
 * code, and a baffling message for someone who signed up a minute ago.
 *
 * Resolves the same way for every input: unknown address, already-verified
 * account, suspended account, or a code actually sent. The caller is told
 * nothing, exactly as at signup.
 */
export async function resendVerificationCode(
  email: string,
  locale: Locale = "en",
): Promise<void> {
  const e = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: e } });
  // Nothing to do for an address with no account, one already verified, or a
  // suspended one — and in all three cases the caller sees the same thing.
  if (!user || user.emailVerified || user.status === "suspended") return;

  // Budget is checked AFTER eligibility, so it is only ever spent on a mail
  // that is actually going out. Checking first would let anyone burn an
  // address's hourly allowance by asking for codes it was never going to get.
  if (!signupMailAllowed(e)) return;

  try {
    await storeAndSendCode(user.id, e, await mintCode(), locale);
  } catch (err) {
    console.error("[verify] resend failed:", (err as Error).message);
  }
}
