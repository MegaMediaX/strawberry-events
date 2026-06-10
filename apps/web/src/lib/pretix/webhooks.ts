import { PretixError } from "./errors";
import { safeEqual } from "@/lib/security/compare";

export interface PretixWebhookEvent {
  action: string;
  organizer: string;
  event?: string;
  code?: string;
}

/**
 * Verify an incoming pretix webhook against a shared secret presented in the
 * `X-Pretix-Webhook-Secret` header (header only — never accepted via query
 * string, which leaks into logs/proxies). Uses a timing-safe comparison and
 * never logs secret values. Throws PretixError (401/503) on failure.
 */
export async function verifyWebhook(request: Request): Promise<PretixWebhookEvent> {
  const expected = process.env.PRETIX_WEBHOOK_SECRET;
  if (!expected || expected.trim() === "") {
    // Misconfiguration; in production startup env validation blocks this state.
    throw new PretixError("webhook secret not configured", 503);
  }

  const provided = request.headers.get("x-pretix-webhook-secret");
  if (!provided || !safeEqual(provided, expected)) {
    throw new PretixError("invalid webhook signature", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new PretixError("invalid webhook payload", 400);
  }

  return {
    action: String(body.action ?? ""),
    organizer: String(body.organizer ?? ""),
    event: body.event ? String(body.event) : undefined,
    code: body.code ? String(body.code) : undefined,
  };
}
