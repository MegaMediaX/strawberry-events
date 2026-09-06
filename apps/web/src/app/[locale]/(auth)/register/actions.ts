"use server";

import { cookies } from "next/headers";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { registerAttendee } from "@/lib/auth/register";
import { newFlowToken } from "@/lib/auth/email-verification";
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

/**
 * Where the flow token lives between asking for a code and typing it.
 *
 * httpOnly so page scripts cannot read it, and short-lived because the code it
 * accompanies lasts ten minutes. It is set on BOTH signup branches — a cookie
 * that appeared only when an account was created would answer, from the browser
 * rather than the response body, the very question registerAttendee refuses to
 * answer.
 */
const FLOW_COOKIE = "verify_flow";

async function setFlowCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(FLOW_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
}

async function readFlowCookie(): Promise<string | null> {
  return (await cookies()).get(FLOW_COOKIE)?.value ?? null;
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
  const flow = newFlowToken();
  await setFlowCookie(flow.token);
  await resendVerificationCode(values.email, toLocale(values.locale), flow.token);
  return { ok: true };
}
