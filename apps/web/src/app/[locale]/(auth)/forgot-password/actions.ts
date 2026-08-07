"use server";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { requestPasswordReset } from "@/lib/auth/password-reset";

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
