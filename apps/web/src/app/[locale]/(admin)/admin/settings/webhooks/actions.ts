"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import {
  createWebhook,
  setWebhookEnabled,
  rotateWebhookSecret,
  testWebhook,
} from "@/lib/webhooks/admin-service";

const path = (l: string) => `/${l}/admin/settings/webhooks`;

export async function createWebhookAction(
  locale: string,
  organizationId: string,
  url: string,
  events: string[],
) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const wh = await createWebhook(session, { organizationId, url, events });
    revalidatePath(path(locale));
    return { ok: true, secret: wh.secret };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setEnabledAction(locale: string, id: string, enabled: boolean) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await setWebhookEnabled(session, id, enabled);
    revalidatePath(path(locale));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function rotateSecretAction(locale: string, id: string) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const wh = await rotateWebhookSecret(session, id);
    revalidatePath(path(locale));
    return { ok: true, secret: wh.secret };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function testWebhookAction(id: string) {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const { ok } = await testWebhook(session, id);
    return { ok, delivered: ok };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
