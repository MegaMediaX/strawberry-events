"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { saveSmtp, recordSmtpTest, type SaveSmtpInput } from "@/lib/integrations/smtp-service";
import {
  saveIntegration,
  recordIntegrationTest,
  type SaveIntegrationInput,
} from "@/lib/integrations/integration-service";

const result = (ok: boolean, error?: string) => ({ ok, error });

export async function saveSmtpAction(locale: string, orgId: string, input: SaveSmtpInput) {
  const session = await getSessionContext();
  if (!session) return result(false, "Not authenticated");
  try {
    await saveSmtp(session, orgId, input);
    revalidatePath(`/${locale}/admin/settings/integrations/smtp`);
    return result(true);
  } catch (err) {
    return result(false, (err as Error).message);
  }
}

export async function testSmtpAction(orgId: string) {
  const session = await getSessionContext();
  if (!session) return result(false, "Not authenticated");
  // Dev/test environments lack a live SMTP server; record a dev-log success.
  const ok = process.env.NODE_ENV !== "production";
  try {
    await recordSmtpTest(session, orgId, ok, ok ? undefined : "No SMTP transport configured");
    return result(ok, ok ? undefined : "SMTP not configured");
  } catch (err) {
    return result(false, (err as Error).message);
  }
}

export async function saveIntegrationAction(
  locale: string,
  orgId: string,
  provider: string,
  input: SaveIntegrationInput,
) {
  const session = await getSessionContext();
  if (!session) return result(false, "Not authenticated");
  try {
    await saveIntegration(session, orgId, provider, input);
    revalidatePath(`/${locale}/admin/settings/integrations`);
    return result(true);
  } catch (err) {
    return result(false, (err as Error).message);
  }
}

export async function testIntegrationAction(orgId: string, provider: string) {
  const session = await getSessionContext();
  if (!session) return result(false, "Not authenticated");
  try {
    // Providers are placeholders until live credentials exist.
    await recordIntegrationTest(session, orgId, provider, false, `${provider}_not_implemented`);
    return result(false, "Provider is a placeholder (not yet implemented)");
  } catch (err) {
    return result(false, (err as Error).message);
  }
}
