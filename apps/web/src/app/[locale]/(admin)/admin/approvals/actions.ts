"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { approve, reject } from "@/lib/approval/service";

export interface DecisionResult {
  ok: boolean;
  error?: string;
}

export async function approveAction(
  locale: string,
  orderId: string,
): Promise<DecisionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await approve(session, orderId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/approvals`);
  return { ok: true };
}

export async function rejectAction(
  locale: string,
  orderId: string,
): Promise<DecisionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await reject(session, orderId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/approvals`);
  return { ok: true };
}
