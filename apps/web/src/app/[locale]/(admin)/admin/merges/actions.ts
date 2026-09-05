"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/client-ip";
import { reverseFromLedger, type OperatorResult } from "@/lib/merge/admin";

export async function reverseAction(
  locale: string,
  eventId: string,
  reason: string,
): Promise<OperatorResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const res = await reverseFromLedger(session, { eventId, reason, ip: await clientIp() });
    if (res.ok) revalidatePath(`/${locale}/admin/merges`);
    return res;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
