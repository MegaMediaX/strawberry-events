import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { generateKey } from "./keys";
import { isScope, type Scope } from "./scopes";

/** Only super admins and organizer admins (not impersonating) may manage integrations. */
function assertCanManage(session: SessionContext, organizationId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot manage API keys while impersonating");
  }
  if (session.isSuperAdmin) return;
  const ok = session.memberships.some(
    (m) => m.organizationId === organizationId && m.role === "organizer_admin",
  );
  if (!ok) throw new ForbiddenError("Requires organizer admin for this organization");
}

export interface CreateKeyInput {
  organizationId: string;
  name: string;
  scopes: string[];
  eventRestrictions?: string[];
  rateLimitPerMin?: number;
  expiresAt?: Date | null;
}

/** Create an API key. Returns the raw key ONCE (never stored). */
export async function createApiKey(session: SessionContext, input: CreateKeyInput) {
  assertCanManage(session, input.organizationId);
  const scopes = input.scopes.filter(isScope) as Scope[];
  const { raw, hash, prefix } = generateKey();
  const key = await prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      keyHash: hash,
      prefix,
      scopes,
      eventRestrictions: input.eventRestrictions ?? [],
      rateLimitPerMin: input.rateLimitPerMin ?? 120,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: session.userId,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId, actorUserId: session.userId,
      action: "apikey.created", entityType: "api_key", entityId: key.id,
    },
  });
  return { raw, key };
}

export async function listApiKeys(session: SessionContext, organizationId: string) {
  assertCanManage(session, organizationId);
  return prisma.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(session: SessionContext, keyId: string) {
  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key || !key.organizationId) throw new ForbiddenError("Key not found");
  assertCanManage(session, key.organizationId);
  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: key.organizationId, actorUserId: session.userId,
      action: "apikey.revoked", entityType: "api_key", entityId: keyId,
    },
  });
  return updated;
}
