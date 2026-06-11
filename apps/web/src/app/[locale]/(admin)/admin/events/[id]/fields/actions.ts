"use server";

import { getSessionContext } from "@/lib/auth/session";
import { defineField, type DefineFieldInput } from "@/lib/admin/custom-fields";

export interface FieldActionResult {
  ok: boolean;
  error?: string;
}

export async function defineFieldAction(input: DefineFieldInput): Promise<FieldActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await defineField(session, input);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
