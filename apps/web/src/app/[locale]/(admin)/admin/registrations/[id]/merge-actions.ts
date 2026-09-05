"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/client-ip";
import { linkOrderByEmail, unlinkOrder, type OperatorResult } from "@/lib/merge/admin";

/**
 * Ownership changes go through lib/merge/admin, which enforces the role, the
 * organisation scope and the impersonation block. These wrappers exist only to
 * resolve the session and the client IP — the IP through client-ip.ts, since
 * the ledger records it and the request header is caller-controlled.
 */
export async function linkAction(
  locale: string,
  orderId: string,
  email: string,
  reason: string,
): Promise<OperatorResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const res = await linkOrderByEmail(session, {
      orderId,
      email,
      reason,
      ip: await clientIp(),
    });
    if (res.ok) revalidatePath(`/${locale}/admin/registrations/${orderId}`);
    return res;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function unlinkAction(
  locale: string,
  orderId: string,
  reason: string,
): Promise<OperatorResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const res = await unlinkOrder(session, { orderId, reason, ip: await clientIp() });
    if (res.ok) revalidatePath(`/${locale}/admin/registrations/${orderId}`);
    return res;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
