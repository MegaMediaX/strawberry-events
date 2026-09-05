import { prisma } from "@/lib/db/client";
import { hashPassword } from "./password";
import { mintCode, storeAndSendCode } from "./email-verification";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/service";
import { accountExistsEmail, type Locale } from "@/lib/email/templates";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Per-ADDRESS cap on signup mail, on top of the per-IP throttle in the action.
 * The per-IP one does not protect a victim: an attacker rotating source IPs can
 * point every request at one address. This is the same shape the resend-ticket
 * action already uses to stop a known order code being used to mailbomb.
 */
const MAIL_LIMIT = 3;
const MAIL_WINDOW_MS = 60 * 60 * 1000;

export interface RegisterResult {
  ok: boolean;
  error?: string;
}

/**
 * Create a role-less attendee account: email + argon2id password hash, no
 * OrganizationMember (admin/staff roles are granted only via user management).
 * Does NOT auto-link prior guest orders made with the same email.
 *
 * ACCOUNT ENUMERATION
 * This used to answer "An account with this email already exists." for a taken
 * address, which turns the public signup form into a membership oracle for any
 * address an attacker cares to type. It now resolves IDENTICALLY either way and
 * never returns `userId`, so no caller can branch on the outcome.
 *
 * An identical RESPONSE is not enough on its own — see the two hashes below.
 *
 * The distinction still has to reach someone, so it reaches the mailbox owner
 * instead of the submitter: a taken address gets "you already have an account",
 * a free one gets a verification code. Exactly one mail on either branch, which
 * is also what makes the caller's neutral "check your inbox" screen true.
 */
export async function registerAttendee(
  email: string,
  password: string,
  name?: string,
  locale: Locale = "en",
): Promise<RegisterResult> {
  const e = email.toLowerCase().trim();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Enter a valid email address." };
  if (!password || password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  const appUrl = process.env.APP_URL ?? "";
  const loginUrl = `${appUrl}/${locale}/login`;

  const existing = await prisma.user.findUnique({ where: { email: e } });

  /**
   * Both argon2 calls run UNCONDITIONALLY, before the branch, and their results
   * are thrown away when the address is taken.
   *
   * Each is ~20ms of CPU with very little variance. Doing either one on only
   * the create path made the two branches differ by that much every single
   * time — a cleaner signal than the response body ever was, since a caller who
   * cannot see any difference in what we SAY can still time what we DO.
   * Averaging a handful of requests washes out network jitter and the SMTP
   * round-trip (both branches send exactly one mail); it does not wash out
   * deterministic CPU.
   *
   * The wasted work on the existing-address path is the entire point. Do not
   * "optimise" either of these back inside the if.
   */
  const passwordHash = await hashPassword(password);
  const minted = await mintCode();

  if (existing) {
    // A suspended account is told nothing at all — the same silence
    // requestPasswordReset() keeps — but the caller still sees success.
    if (existing.status !== "suspended") {
      await notify(e, accountExistsEmail(locale, loginUrl, `${appUrl}/${locale}/forgot-password`));
    }
    return { ok: true };
  }

  const user = await prisma.user.create({
    data: { email: e, passwordHash, name: name?.trim() || null, emailVerified: null },
  });

  if (rateLimit(`signup-mail:${e}`, MAIL_LIMIT, MAIL_WINDOW_MS).allowed) {
    try {
      await storeAndSendCode(user.id, e, minted, locale);
    } catch (err) {
      console.error("[register] verification mail failed:", (err as Error).message);
    }
  }
  return { ok: true };
}

/**
 * Send one signup mail, capped per address.
 *
 * A transport failure must never reach the caller — an error surfacing from one
 * branch only is the oracle again — but it must not vanish either: if SMTP
 * breaks, nobody gets a code or an account-exists mail and, without this line,
 * there is no signal anywhere that it happened.
 */
async function notify(to: string, msg: { subject: string; text: string }): Promise<void> {
  if (!rateLimit(`signup-mail:${to}`, MAIL_LIMIT, MAIL_WINDOW_MS).allowed) return;
  try {
    await sendEmail(
      { to, ...msg },
      { templateType: "account_signup", organizationId: null, attendeeRef: to },
    );
  } catch (err) {
    // Server-side only. The address is deliberately not logged.
    console.error("[register] signup mail failed:", (err as Error).message);
  }
}
