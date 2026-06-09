import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/client";
import type { WebhookEvent } from "./events";

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 60_000;

/** HMAC-SHA256 hex signature over `${timestamp}.${body}`. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

interface DeliveryRow {
  id: string;
  event: string;
  payload: unknown;
  attempts: number;
  webhook: { url: string; secret: string };
}

/** Deliver a single webhook delivery. Never throws; records the outcome. */
export async function deliver(d: DeliveryRow, now: Date = new Date()): Promise<boolean> {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ id: d.id, event: d.event, data: d.payload });
  const signature = signPayload(d.webhook.secret, timestamp, body);
  try {
    const res = await fetch(d.webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Strawberry-Event": d.event,
        "X-Strawberry-Delivery": d.id,
        "X-Strawberry-Timestamp": timestamp,
        "X-Strawberry-Signature": signature,
      },
      body,
    });
    const success = res.ok;
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        success,
        responseCode: res.status,
        attempts: d.attempts + 1,
        deliveredAt: success ? now : null,
        error: success ? null : `HTTP ${res.status}`,
        nextRetryAt: success || d.attempts + 1 >= MAX_ATTEMPTS ? null : new Date(now.getTime() + RETRY_BACKOFF_MS),
      },
    });
    return success;
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        success: false,
        attempts: d.attempts + 1,
        error: (err as Error).message,
        nextRetryAt: d.attempts + 1 >= MAX_ATTEMPTS ? null : new Date(now.getTime() + RETRY_BACKOFF_MS),
      },
    });
    return false;
  }
}

/**
 * Emit an event to all active, subscribed webhooks for an org (optionally scoped
 * to an event). Fire-and-forget: never throws, so it cannot break the primary
 * user action. Callers should `void emit(...)`.
 */
export async function emit(
  organizationId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  eventId?: string,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        organizationId,
        active: true,
        events: { has: event },
        ...(eventId ? { OR: [{ eventId: null }, { eventId }] } : {}),
      },
    });
    for (const wh of webhooks) {
      const d = await prisma.webhookDelivery.create({
        data: { webhookId: wh.id, event, payload: payload as object },
      });
      await deliver({ id: d.id, event, payload, attempts: 0, webhook: { url: wh.url, secret: wh.secret } });
    }
  } catch {
    // Webhook emission must never break the primary action.
  }
}

/** Re-attempt deliveries whose nextRetryAt is due. */
export async function retryDue(now: Date = new Date()): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { success: false, nextRetryAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
    include: { webhook: true },
  });
  for (const d of due) {
    await deliver(
      { id: d.id, event: d.event, payload: d.payload, attempts: d.attempts, webhook: { url: d.webhook.url, secret: d.webhook.secret } },
      now,
    );
  }
  return due.length;
}
