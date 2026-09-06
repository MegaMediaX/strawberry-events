"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/client";
import {
  resendVerificationCode,
  checkVerificationCode,
  CODE_REJECTED,
} from "@/lib/auth/email-verification";
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

  const ip = await clientIp();
  if (!rateLimit(`verify-self-send:${session.userId}`, 5, 60 * 60_000).allowed) {
    return { ok: false, error: "Too many requests. Please try again later." };
  }
  void ip;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) return { ok: false, error: "Sign in first." };
  if (user.emailVerified) return { ok: false, error: "Your address is already verified." };

  // Shares the per-address mail cap with signup, so this cannot be used to mail
  // someone more often than signing up already could.
  await resendVerificationCode(user.email, locale === "ar" ? "ar" : ("en" as Locale));
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

  const ip = await clientIp();
  if (!rateLimit(`verify-self-check:${ip}`, 30, 5 * 60_000).allowed) {
    return { ok: false, error: CODE_REJECTED };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!user) return { ok: false, error: CODE_REJECTED };

  const res = await checkVerificationCode(user.email, code);
  if (res.ok) revalidatePath(`/${locale}/profile`);
  return res;
}
