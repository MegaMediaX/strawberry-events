"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { approve, approveAll, reject } from "@/lib/approval/service";

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
  revalidatePath(`/${locale}/admin/approvals/${orderId}`);
  return { ok: true };
}

export interface ApproveAllResult {
  ok: boolean;
  approved?: number;
  skipped?: number;
  error?: string;
}

export async function approveAllAction(
  locale: string,
): Promise<ApproveAllResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const { approved, skipped } = await approveAll(session);
    revalidatePath(`/${locale}/admin/approvals`);
    return { ok: true, approved, skipped };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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
  revalidatePath(`/${locale}/admin/approvals/${orderId}`);
  return { ok: true };
}
