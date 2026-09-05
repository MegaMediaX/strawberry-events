"use server";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { registerAttendee } from "@/lib/auth/register";
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
  const res = await registerAttendee(
    values.email,
    values.password,
    values.name,
    toLocale(values.locale),
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
  return checkVerificationCode(values.email, values.code);
}

/**
 * Ask for a replacement code. Always resolves the same way — see
 * resendVerificationCode; the per-address mail cap is shared with signup, so
 * this cannot be used to mail someone more often than signing up would.
 */
export async function resendCodeAction(values: {
  email: string;
  locale?: string;
}): Promise<RegisterAccountResult> {
  const ip = await clientIp();
  if (!rateLimit(`resend-code:${ip}`, 5, 5 * 60_000).allowed) {
    return { ok: true };
  }
  await resendVerificationCode(values.email, toLocale(values.locale));
  return { ok: true };
}
