"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { markOrderPaid } from "@/lib/finance/service";

export interface MarkPaidResult {
  ok: boolean;
  error?: string;
}

export async function markPaidAction(
  locale: string,
  orderId: string,
): Promise<MarkPaidResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await markOrderPaid(session, orderId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/finance`);
  return { ok: true };
}
