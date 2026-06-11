"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/security/rate-limit";
import { registerAttendee } from "@/lib/auth/register";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

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
