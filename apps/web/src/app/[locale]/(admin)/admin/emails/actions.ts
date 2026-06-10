"use server";

import { getSessionContext } from "@/lib/auth/session";
import { resendEmail } from "@/lib/admin/emails";

export interface ResendActionResult {
  ok: boolean;
  sent?: boolean;
  error?: string;
}

export async function resendEmailAction(id: string): Promise<ResendActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const r = await resendEmail(session, id);
    return { ok: true, sent: r.sent };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
