import { PretixError } from "./errors";

export interface PretixWebhookEvent {
  action: string;
  organizer: string;
  event?: string;
  code?: string;
}

/**
 * Verify an incoming pretix webhook against a shared secret (query `?secret=` or
 * `X-Pretix-Webhook-Secret` header) and parse its payload. Throws PretixError on a
 * missing/incorrect secret.
 */
export async function verifyWebhook(request: Request): Promise<PretixWebhookEvent> {
  const expected = process.env.PRETIX_WEBHOOK_SECRET;
  if (!expected) throw new PretixError("PRETIX_WEBHOOK_SECRET not configured");

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("x-pretix-webhook-secret");
  if (!provided || provided !== expected) {
    throw new PretixError("invalid webhook secret", 401);
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
