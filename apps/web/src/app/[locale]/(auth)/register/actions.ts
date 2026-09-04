"use server";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { registerAttendee } from "@/lib/auth/register";
import type { Locale } from "@/lib/email/templates";

export interface RegisterAccountResult {
  ok: boolean;
  error?: string;
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
  const locale: Locale = values.locale === "ar" ? "ar" : "en";
  const res = await registerAttendee(values.email, values.password, values.name, locale);
  return { ok: res.ok, error: res.error };
}
