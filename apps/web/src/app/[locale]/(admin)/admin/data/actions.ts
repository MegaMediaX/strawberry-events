"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { canAccessEvent, rolesInOrg } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { createWebhook, listWebhooks, HANDLED_ACTION_TYPES } from "@/lib/pretix/webhooks";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Register the inbound pretix webhook.
 *
 * Without it the handlers in `lib/pretix/handlers/` never run, so an order
 * marked paid in the pretix UI, a cancellation, or a scan from pretixSCAN never
 * reaches this database. Reconciling by hand while that is true is a treadmill:
 * the state re-drifts the moment you finish.
 */
export async function registerWebhookAction(
  locale: string,
  eventId: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, message: "Not authenticated" };

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return {
      ok: false,
      message: "APP_URL is not set, so pretix would be given an unusable callback address.",
    };
  }

  try {
    const mapping = await prisma.eventMapping.findUniqueOrThrow({ where: { id: eventId } });

    // Authorise against the organization that owns THIS event, not against
    // roles held anywhere. A server action is reachable by RPC with whatever
    // arguments the caller sends — the button only decides what the page
    // renders, never what a direct request may pass — so an admin of an
    // unrelated org could otherwise register a webhook using this org's
    // decrypted pretix token.
    if (
      !canAccessEvent(session, mapping.organizationId, mapping.localEventId) ||
      (!session.isSuperAdmin &&
        !rolesInOrg(session, mapping.organizationId).includes("organizer_admin"))
    ) {
      return { ok: false, message: "Requires organizer admin or super admin for this event" };
    }

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: mapping.organizationId },
    });
    const ctx = resolvePretixContext(org);

    // Idempotent: pretix happily accepts duplicate registrations, and each one
    // is an independent subscription, so N clicks means N concurrent deliveries
    // per real event rather than N retries of one.
    const targetUrl = `${appUrl}/api/webhooks/pretix`;
    const existing = await listWebhooks(ctx.organizerSlug, ctx.token);
    const already = existing.find(
      (h) =>
        h.enabled &&
        h.target_url === targetUrl &&
        HANDLED_ACTION_TYPES.every((a) => h.action_types.includes(a)),
    );
    if (already) {
      revalidatePath(`/${locale}/admin/data`);
      return { ok: true, message: `Already registered as webhook #${already.id}. Nothing to do.` };
    }

    const hook = await createWebhook(
      ctx.organizerSlug,
      targetUrl,
      mapping.pretixEventSlug,
      ctx.token,
    );
    revalidatePath(`/${locale}/admin/data`);
    return { ok: true, message: `Registered webhook #${hook.id}. pretix will now notify this app.` };
  } catch (err) {
    // pretix error strings carry the internal base URL and slugs. Keep those in
    // the server log, not on someone's screen.
    console.error("[data] webhook registration failed:", (err as Error).message);
    return { ok: false, message: "Could not register the webhook with pretix. See server logs." };
  }
}
