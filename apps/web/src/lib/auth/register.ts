import { prisma } from "@/lib/db/client";
import { hashPassword } from "./password";
import { sendEmail } from "@/lib/email/service";
import {
  accountCreatedEmail,
  accountExistsEmail,
  type Locale,
} from "@/lib/email/templates";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RegisterResult {
  ok: boolean;
  error?: string;
}

/**
 * Create a role-less attendee account: email + argon2id password hash, no
 * OrganizationMember (admin/staff roles are granted only via user management).
 * No email-verification gate (parity with guest magic-link) — emailVerified
 * stays null. Does NOT auto-link prior guest orders made with the same email.
 *
 * ACCOUNT ENUMERATION
 * This used to answer "An account with this email already exists." for a taken
 * address, which turns the public signup form into a membership oracle for any
 * address an attacker cares to type. It now resolves IDENTICALLY either way and
 * never returns `userId`, so no caller can branch on the outcome.
 *
 * The distinction still has to reach someone, so it reaches the mailbox owner
 * instead of the submitter: a taken address gets "you already have an account",
 * a free one gets "your account is ready". Both branches send exactly one mail,
 * which is also what makes the caller's neutral "check your inbox" screen true.
 *
 * Mail failures are swallowed for the same reason a mismatch in the response
 * would matter: an error surfacing from only one branch is the oracle again.
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

  if (existing) {
    // A suspended account is told nothing at all — the same silence
    // requestPasswordReset() keeps — but the caller still sees success.
    if (existing.status !== "suspended") {
      await notify(e, accountExistsEmail(locale, loginUrl, `${appUrl}/${locale}/forgot-password`));
    }
    return { ok: true };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email: e, passwordHash, name: name?.trim() || null, emailVerified: null },
  });
  await notify(e, accountCreatedEmail(locale, loginUrl));
  return { ok: true };
}

/** Never let a transport failure become the difference between the two branches. */
async function notify(to: string, msg: { subject: string; text: string }): Promise<void> {
  try {
    await sendEmail(
      { to, ...msg },
      { templateType: "account_signup", organizationId: null, attendeeRef: to },
    );
  } catch {
    // deliberately swallowed
  }
}
