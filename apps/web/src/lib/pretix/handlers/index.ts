import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { getEvent } from "@/lib/pretix/events";
import type { PretixWebhookEvent } from "@/lib/pretix/webhooks";
import { handleOrderPaid } from "./order-paid";
import { handleOrderCanceled } from "./order-canceled";
import { handleCheckinCreated } from "./checkin-created";
import type { ReconcileCtx } from "./types";

// pretix action strings for the events we reconcile.
const ORDER_PAID = "pretix.event.order.paid";
const ORDER_CANCELED = "pretix.event.order.canceled";
const CHECKIN_CREATED = "pretix.event.checkin.created";
// Action name for live-state toggles is not strongly documented; match the
// plausible variants and reconcile liveOnPretix from pretix as source of truth.
const LIVE_ACTIONS = new Set([
  "pretix.event.live_state_changed",
  "pretix.event.event.changed",
  "pretix.event.changed",
]);

/**
 * Route a verified pretix webhook to the right reconciliation handler. Resolves
 * the local EventMapping + org context first. Unknown event slugs and unhandled
 * actions are logged and ignored (return 200) so pretix does not retry forever.
 * TODO: a ProcessedWebhookEvent dedup table if delivery volume ever demands it.
 */
export async function dispatch(event: PretixWebhookEvent): Promise<void> {
  const mapping = await prisma.eventMapping.findFirst({
    where: { pretixOrganizerSlug: event.organizer, pretixEventSlug: event.event },
    select: { id: true, organizationId: true, pretixEventSlug: true },
  });
  if (!mapping) {
    console.warn("[pretix-webhook] no EventMapping for", event.organizer, event.event);
    return;
  }

  const org = await prisma.organization.findUnique({ where: { id: mapping.organizationId } });
  if (!org) {
    console.warn("[pretix-webhook] no organization for mapping", mapping.id);
    return;
  }
  const { organizerSlug, token } = resolvePretixContext(org);

  // Live-state reconciliation (no order code involved).
  if (LIVE_ACTIONS.has(event.action)) {
    try {
      const ev = await getEvent(organizerSlug, mapping.pretixEventSlug, token);
      await prisma.eventMapping.updateMany({
        where: { pretixOrganizerSlug: event.organizer, pretixEventSlug: mapping.pretixEventSlug },
        data: { liveOnPretix: ev.live },
      });
    } catch (err) {
      console.warn("[pretix-webhook] live-state reconcile failed", (err as Error).message);
    }
    return;
  }

  if (event.action !== ORDER_PAID && event.action !== ORDER_CANCELED && event.action !== CHECKIN_CREATED) {
    console.info("[pretix-webhook] unhandled action", event.action);
    return;
  }

  if (!event.code) {
    console.warn("[pretix-webhook] missing order code for", event.action);
    return;
  }

  const ctx: ReconcileCtx = {
    organizerSlug,
    pretixEventSlug: mapping.pretixEventSlug,
    token,
    orderCode: event.code,
    eventMappingId: mapping.id,
    organizationId: mapping.organizationId,
  };

  switch (event.action) {
    case ORDER_PAID:
      await handleOrderPaid(ctx);
      return;
    case ORDER_CANCELED:
      await handleOrderCanceled(ctx);
      return;
    case CHECKIN_CREATED:
      await handleCheckinCreated(ctx);
      return;
  }
}
