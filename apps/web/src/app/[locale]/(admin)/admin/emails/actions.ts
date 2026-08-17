"use server";

import { getSessionContext } from "@/lib/auth/session";
import { resendEmail } from "@/lib/admin/emails";

export interface ResendActionResult {
  ok: boolean;
  sent?: boolean;
  /** Why it did not send — "disabled" is a setting, "send_failed" is a fault. */
  reason?: "disabled" | "send_failed";
  error?: string;
}

export async function resendEmailAction(id: string): Promise<ResendActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const r = await resendEmail(session, id);
    return { ok: true, sent: r.sent, reason: r.reason, error: r.error };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
