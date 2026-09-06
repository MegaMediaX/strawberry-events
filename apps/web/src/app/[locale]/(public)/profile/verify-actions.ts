"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/client";
import {
  resendVerificationCode,
  newFlowToken,
  checkVerificationCode,
  CODE_REJECTED,
} from "@/lib/auth/email-verification";
import { setFlowCookie, readFlowCookie } from "@/lib/auth/verify-flow-cookie";
import type { Locale } from "@/lib/email/templates";

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * The address is taken from the SESSION, never from the caller.
 *
 * That is what makes this the safest of the three places a code can be issued.
 * Signup has to accept a typed address and therefore has to answer neutrally to
 * avoid becoming a membership oracle; here there is nothing to probe — you can
 * only ever ask for a code to the address you are already signed in as, and it
 * is only ever mailed there.
 */
export async function sendMyVerificationCode(
  locale: string,
): Promise<VerifyResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sign in first." };

  if (!rateLimit(`verify-self-send:${session.userId}`, 5, 60 * 60_000).allowed) {
    return { ok: false, error: "Too many requests. Please try again later." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) return { ok: false, error: "Sign in first." };
  if (user.emailVerified) return { ok: false, error: "Your address is already verified." };

  // Shares the per-address mail cap with signup, so this cannot be used to mail
  // someone more often than signing up already could.
  // Same reuse rule as the signup resend — see the note there.
  const flowToken = (await readFlowCookie()) ?? newFlowToken().token;
  await setFlowCookie(flowToken);
  /**
   * No origin is charged here, on purpose.
   *
   * The per-origin cap exists because the signup resend takes a TYPED address,
   * so a stranger can aim it at someone else. This one takes the address from
   * the session: you can only ever ask for a code to your own inbox, and the
   * per-account limiter above already bounds it. Charging an origin as well
   * would punish everyone sharing the venue WiFi for one person's retries.
   */
  await resendVerificationCode(user.email, locale === "ar" ? "ar" : ("en" as Locale), flowToken, undefined);
  return { ok: true };
}

/**
 * Submit the code. Checked against the session's own address, so a code issued
 * for one account can never verify another.
 */
export async function verifyMyEmail(
  locale: string,
  code: string,
): Promise<VerifyResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sign in first." };

  /**
   * Keyed by ACCOUNT, not by IP.
   *
   * The anonymous signup equivalent keys by IP because that is the only
   * identity it has. Here the caller is signed in, and keying by IP at a
   * physical event is actively harmful: everyone on the venue WiFi shares one
   * egress address, so one person exhausting the bucket would stop every other
   * attendee submitting a genuine code for the next five minutes. The real
   * guessing limit is the 5-attempt counter on the code row anyway; this only
   * needs to bound noise from one account.
   */
  if (!rateLimit(`verify-self-check:${session.userId}`, 30, 5 * 60_000).allowed) {
    return { ok: false, error: CODE_REJECTED };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!user) return { ok: false, error: CODE_REJECTED };

  const res = await checkVerificationCode(user.email, code, await readFlowCookie());
  if (res.ok) revalidatePath(`/${locale}/profile`);
  return res;
}
