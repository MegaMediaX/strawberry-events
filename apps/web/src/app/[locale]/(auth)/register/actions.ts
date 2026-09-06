"use server";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { registerAttendee } from "@/lib/auth/register";
import { newFlowToken } from "@/lib/auth/email-verification";
import { setFlowCookie, readFlowCookie } from "@/lib/auth/verify-flow-cookie";
import {
  checkVerificationCode,
  resendVerificationCode,
  CODE_REJECTED,
} from "@/lib/auth/email-verification";
import type { Locale } from "@/lib/email/templates";

export interface RegisterAccountResult {
  ok: boolean;
  error?: string;
}

function toLocale(v: string | undefined): Locale {
  return v === "ar" ? "ar" : "en";
}

/**
 * The result never distinguishes a free address from a taken one. Only input
 * validation and the throttle can produce `ok: false` — see registerAttendee.
 */
export async function registerAction(values: {
  email: string;
  password: string;
  confirm: string;
  name?: string;
  locale?: string;
}): Promise<RegisterAccountResult> {
  // Defense-in-depth rate limit (pair with edge/CDN): 10 signups/min/IP.
  const ip = await clientIp();
  if (!rateLimit(`register-account:${ip}`, 10, 60_000).allowed) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  if (values.password !== values.confirm) {
    return { ok: false, error: "Passwords do not match." };
  }
  // Minted here and handed to the browser regardless of which branch runs, so
  // the cookie's presence reveals nothing the response body conceals.
  const flow = newFlowToken();
  await setFlowCookie(flow.token);

  const res = await registerAttendee(
    values.email,
    values.password,
    values.name,
    toLocale(values.locale),
    flow.token,
    { kind: "public", origin: await clientIp() },
  );
  return { ok: res.ok, error: res.error };
}

/**
 * Submit a verification code.
 *
 * The per-IP limit here is a blunt instrument against a distributed guessing
 * run; the counter that actually bounds a single code is `attempts` on the row,
 * because THIS one lives in memory and is wiped whenever the container is
 * recreated — which is every deploy.
 */
export async function verifyEmailAction(values: {
  email: string;
  code: string;
}): Promise<RegisterAccountResult> {
  const ip = await clientIp();
  if (!rateLimit(`verify-email:${ip}`, 30, 5 * 60_000).allowed) {
    return { ok: false, error: CODE_REJECTED };
  }
  return checkVerificationCode(values.email, values.code, await readFlowCookie());
}

/**
 * Ask for a replacement code. Always resolves the same way — see
 * resendVerificationCode.
 *
 * Two caps apply, and they answer different threats. The per-address ceiling is
 * shared with signup, so this cannot be used to mail someone more often than
 * signing up already could. The per-origin cap, charged from the IP below, is
 * what stops a stranger emptying that ceiling: it sits strictly under it, so the
 * address owner always keeps a mail in hand.
 */
export async function resendCodeAction(values: {
  email: string;
  locale?: string;
}): Promise<RegisterAccountResult> {
  const ip = await clientIp();
  if (!rateLimit(`resend-code:${ip}`, 5, 5 * 60_000).allowed) {
    return { ok: true };
  }
  /**
   * Reuse the flow this browser already holds; only mint one when there is none.
   *
   * Minting a fresh token on every click meant no real caller ever resent within
   * a flow — so the per-flow supersede in storeAndSendCode never fired in
   * production, and each click left the previous code live but unreachable, its
   * flowHash no longer matching the cookie the browser had just been given. The
   * user saw the generic rejection and had no way to tell it from a typo.
   *
   * Reusing it also stops the cookie being overwritten on the paths that send
   * nothing at all — ineligible address, budget spent — which used to orphan a
   * still-valid code from the user's own earlier request.
   */
  const flowToken = (await readFlowCookie()) ?? newFlowToken().token;
  await setFlowCookie(flowToken);
  await resendVerificationCode(values.email, toLocale(values.locale), flowToken, {
    kind: "public",
    origin: ip,
  });
  return { ok: true };
}
