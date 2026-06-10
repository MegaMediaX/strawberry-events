"use server";

import { resetPassword } from "@/lib/auth/password-reset";

export interface ResetActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Not IP rate-limited by design: the token is single-use + 1h-expiry, which
 * already bounds abuse, and legitimate users may retry after a typo. The token
 * is posted in the body (never logged).
 */
export async function resetPasswordAction(
  token: string,
  password: string,
  confirm: string,
): Promise<ResetActionResult> {
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  return resetPassword(token, password);
}
