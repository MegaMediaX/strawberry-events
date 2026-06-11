"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { cancelRegistration } from "@/lib/registration/cancel";

export interface CancelResult {
  ok: boolean;
  error?: string;
}

export async function cancelRegistrationAction(
  locale: string,
  orderId: string,
): Promise<CancelResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await cancelRegistration(session, orderId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/registrations/${orderId}`);
  revalidatePath(`/${locale}/admin/registrations`);
  return { ok: true };
}
