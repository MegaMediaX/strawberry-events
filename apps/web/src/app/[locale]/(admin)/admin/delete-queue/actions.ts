"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { restore, cancelPurge, markPurged } from "@/lib/archive/service";

const ok = (b: boolean, error?: string) => ({ ok: b, error });

async function run(locale: string, fn: (s: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>) => Promise<unknown>) {
  const session = await getSessionContext();
  if (!session) return ok(false, "Not authenticated");
  try {
    await fn(session);
    revalidatePath(`/${locale}/admin/delete-queue`);
    return ok(true);
  } catch (err) {
    return ok(false, (err as Error).message);
  }
}

export async function restoreAction(locale: string, id: string) {
  return run(locale, (s) => restore(s, id));
}
export async function cancelAction(locale: string, id: string) {
  return run(locale, (s) => cancelPurge(s, id));
}
export async function purgeAction(locale: string, id: string) {
  return run(locale, (s) => markPurged(s, id));
}
