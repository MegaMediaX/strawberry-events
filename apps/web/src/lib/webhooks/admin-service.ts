import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { isWebhookEvent } from "./events";
import { deliver } from "./service";
import { assertSafeWebhookUrl } from "./ssrf-guard";

function assertCanManage(session: SessionContext, organizationId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot manage webhooks while impersonating");
  }
  if (session.isSuperAdmin) return;
  const ok = session.memberships.some(
    (m) => m.organizationId === organizationId && m.role === "organizer_admin",
  );
  if (!ok) throw new ForbiddenError("Requires organizer admin for this organization");
}

function newSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

async function audit(session: SessionContext, orgId: string, action: string, entityId: string) {
  await prisma.auditLog.create({
    data: { organizationId: orgId, actorUserId: session.userId, action, entityType: "webhook", entityId },
  });
}

export interface CreateWebhookInput {
  organizationId: string;
  url: string;
  events: string[];
  eventId?: string | null;
}

export async function createWebhook(session: SessionContext, input: CreateWebhookInput) {
  assertCanManage(session, input.organizationId);
  // Reject SSRF-prone targets (non-https, loopback/link-local/RFC-1918) before
  // we ever store the URL. TODO: apply the same guard to any future updateWebhook.
  await assertSafeWebhookUrl(input.url);
  const wh = await prisma.webhook.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId ?? null,
      url: input.url,
      secret: newSecret(),
      events: input.events.filter(isWebhookEvent),
      createdByUserId: session.userId,
    },
  });
  await audit(session, input.organizationId, "webhook.created", wh.id);
  return wh;
}

export async function listWebhooks(session: SessionContext, organizationId: string) {
  assertCanManage(session, organizationId);
  return prisma.webhook.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

async function loadOwned(session: SessionContext, id: string) {
  const wh = await prisma.webhook.findUnique({ where: { id } });
  if (!wh) throw new ForbiddenError("Webhook not found");
  assertCanManage(session, wh.organizationId);
  return wh;
}

export async function setWebhookEnabled(session: SessionContext, id: string, enabled: boolean) {
  const wh = await loadOwned(session, id);
  const updated = await prisma.webhook.update({ where: { id }, data: { active: enabled } });
  await audit(session, wh.organizationId, enabled ? "webhook.enabled" : "webhook.disabled", id);
  return updated;
}

export async function rotateWebhookSecret(session: SessionContext, id: string) {
  const wh = await loadOwned(session, id);
  const updated = await prisma.webhook.update({ where: { id }, data: { secret: newSecret() } });
  await audit(session, wh.organizationId, "webhook.secret_rotated", id);
  return updated;
}

export async function listDeliveries(session: SessionContext, id: string) {
  await loadOwned(session, id);
  return prisma.webhookDelivery.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** Send a test ping delivery to the webhook. */
export async function testWebhook(session: SessionContext, id: string) {
  const wh = await loadOwned(session, id);
  const d = await prisma.webhookDelivery.create({
    data: { webhookId: id, event: "ping", payload: { test: true } },
  });
  const ok = await deliver({
    id: d.id, event: "ping", payload: { test: true }, attempts: 0,
    webhook: { url: wh.url, secret: wh.secret },
  });
  return { ok };
}
