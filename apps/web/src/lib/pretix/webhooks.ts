import { pretixFetch, pretixFetchAll } from "./client";
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

/**
 * Outbound webhook registration — the ORGANIZER-level pretix API.
 *
 * Distinct from `verifyWebhook` above, which authenticates deliveries coming
 * IN. These manage whether pretix sends anything at all.
 *
 * This matters more than it looks. With no webhook registered the handlers in
 * `lib/pretix/handlers/` never run: an order marked paid inside the pretix UI,
 * a cancellation, or a scan from pretixSCAN never reaches our database, and the
 * two drift apart with nothing to reconcile them. That state is invisible —
 * nothing errors, the app simply never hears.
 */
export interface PretixWebhook {
  id: number;
  enabled: boolean;
  target_url: string;
  all_events: boolean;
  limit_events?: string[];
  action_types: string[];
}

/** Every webhook registered for an organizer. Empty means nothing is wired up. */
export async function listWebhooks(
  organizerSlug: string,
  token?: string,
): Promise<PretixWebhook[]> {
  return pretixFetchAll<PretixWebhook>(`/organizers/${organizerSlug}/webhooks/`, token);
}

/** The actions we actually handle — see `lib/pretix/handlers/`. */
export const HANDLED_ACTION_TYPES = [
  "pretix.event.order.paid",
  "pretix.event.order.canceled",
  "pretix.event.checkin",
] as const;

export async function createWebhook(
  organizerSlug: string,
  targetUrl: string,
  eventSlug?: string,
  token?: string,
): Promise<PretixWebhook> {
  return pretixFetch<PretixWebhook>(
    `/organizers/${organizerSlug}/webhooks/`,
    {
      method: "POST",
      body: JSON.stringify({
        target_url: targetUrl,
        enabled: true,
        // Scope to the one event when given. An organizer-wide hook also
        // delivers for unrelated events, and the handlers answer unknown orders
        // with a warning — noise that reads like a fault.
        all_events: !eventSlug,
        ...(eventSlug ? { limit_events: [eventSlug] } : {}),
        action_types: [...HANDLED_ACTION_TYPES],
      }),
    },
    token,
  );
}
