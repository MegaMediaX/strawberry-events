"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/security/rate-limit";
import { requestPasswordReset } from "@/lib/auth/password-reset";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Always resolves the same way (no account enumeration). Rate-limited per IP.
 * The neutral confirmation lives in the UI; this just (maybe) sends the email.
 */
export async function forgotPasswordAction(locale: "en" | "ar", email: string): Promise<{ done: true }> {
  const ip = await clientIp();
  // On rate-limit we still return the neutral response (no signal to the caller).
  if (rateLimit(`forgot:${ip}`, 10, 60_000).allowed && email) {
    await requestPasswordReset(email, locale);
  }
  return { done: true };
}
