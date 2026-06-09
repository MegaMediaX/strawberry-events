import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";
import { assertCanEditIntegration, assertCanViewIntegration } from "./guards";
import { encryptField, redactConfig } from "./secrets";

/** Which config keys are secret per provider (encrypted, never returned). */
export const SECRET_KEYS: Record<string, string[]> = {
  whatsapp: ["accessToken"],
  sms: ["apiKey"],
  whish: ["apiSecret", "callbackSecret"],
  pretix: ["apiToken"],
};

export interface IntegrationView {
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>; // redacted (secrets → <key>Configured)
  lastTestedAt: Date | null;
  lastError: string | null;
}

export async function getIntegration(
  session: SessionContext,
  organizationId: string,
  provider: string,
): Promise<IntegrationView | null> {
  assertCanViewIntegration(session, organizationId);
  const row = await prisma.integrationSetting.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!row) return null;
  return {
    provider,
    enabled: row.enabled,
    config: redactConfig((row.config ?? {}) as Record<string, unknown>, SECRET_KEYS[provider] ?? []),
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
  };
}

export interface SaveIntegrationInput {
  enabled: boolean;
  config: Record<string, unknown>; // non-secret fields
  secrets?: Record<string, string>; // plaintext secrets to (re)encrypt; omit to keep
}

/** Upsert an integration. Secret fields are encrypted; existing kept if omitted. Audited. */
export async function saveIntegration(
  session: SessionContext,
  organizationId: string,
  provider: string,
  input: SaveIntegrationInput,
) {
  assertCanEditIntegration(session, organizationId);
  const existing = await prisma.integrationSetting.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  const prevConfig = (existing?.config ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...prevConfig, ...input.config };
  for (const [k, v] of Object.entries(input.secrets ?? {})) {
    if (v) merged[k] = encryptField(v);
  }
  const row = await prisma.integrationSetting.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    create: { organizationId, provider, enabled: input.enabled, config: merged, updatedByUserId: session.userId },
    update: { enabled: input.enabled, config: merged, updatedByUserId: session.userId },
  });
  await prisma.auditLog.create({
    data: {
      organizationId, actorUserId: session.userId,
      action: "integration.updated", entityType: provider, entityId: row.id, success: true,
    },
  });
  return getIntegration(session, organizationId, provider);
}

/** Record a placeholder test result for an integration. Audited. */
export async function recordIntegrationTest(
  session: SessionContext,
  organizationId: string,
  provider: string,
  ok: boolean,
  error?: string,
) {
  assertCanEditIntegration(session, organizationId);
  await prisma.integrationSetting.update({
    where: { organizationId_provider: { organizationId, provider } },
    data: { lastTestedAt: new Date(), lastError: ok ? null : (error ?? "unknown error") },
  });
  await prisma.auditLog.create({
    data: {
      organizationId, actorUserId: session.userId,
      action: "integration.tested", entityType: provider, entityId: organizationId, success: ok,
    },
  });
}
