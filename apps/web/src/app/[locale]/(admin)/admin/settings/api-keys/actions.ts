"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createApiKey, revokeApiKey } from "@/lib/api/admin-service";

export interface CreateKeyResult {
  ok: boolean;
  raw?: string;
  prefix?: string;
  error?: string;
}

export async function createKeyAction(
  locale: string,
  organizationId: string,
  name: string,
  scopes: string[],
): Promise<CreateKeyResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const { raw, key } = await createApiKey(session, { organizationId, name, scopes });
    revalidatePath(`/${locale}/admin/settings/api-keys`);
    return { ok: true, raw, prefix: key.prefix };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function revokeKeyAction(locale: string, keyId: string) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await revokeApiKey(session, keyId);
    revalidatePath(`/${locale}/admin/settings/api-keys`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
