"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { promote } from "@/lib/waitlist/service";

export interface PromoteResult {
  ok: boolean;
  error?: string;
}

export async function promoteAction(
  locale: string,
  eventId: string,
  entryId: string,
): Promise<PromoteResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await promote(session, entryId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/events/${eventId}/waitlist`);
  return { ok: true };
}
