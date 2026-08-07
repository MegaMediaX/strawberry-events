"use server";

import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { registerAttendee } from "@/lib/auth/register";

export interface RegisterAccountResult {
  ok: boolean;
  error?: string;
}

export async function registerAction(values: {
  email: string;
  password: string;
  confirm: string;
  name?: string;
}): Promise<RegisterAccountResult> {
  // Defense-in-depth rate limit (pair with edge/CDN): 10 signups/min/IP.
  const ip = await clientIp();
  if (!rateLimit(`register-account:${ip}`, 10, 60_000).allowed) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  if (values.password !== values.confirm) {
    return { ok: false, error: "Passwords do not match." };
  }
  const res = await registerAttendee(values.email, values.password, values.name);
  return { ok: res.ok, error: res.error };
}
