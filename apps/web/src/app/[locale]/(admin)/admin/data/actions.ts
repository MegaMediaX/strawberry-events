"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { createWebhook } from "@/lib/pretix/webhooks";

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
  if (!hasAnyRole(session, ["organizer_admin"])) {
    return { ok: false, message: "Requires organizer admin or super admin" };
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return {
      ok: false,
      message: "APP_URL is not set, so pretix would be given an unusable callback address.",
    };
  }

  try {
    const mapping = await prisma.eventMapping.findUniqueOrThrow({ where: { id: eventId } });
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: mapping.organizationId },
    });
    const ctx = resolvePretixContext(org);
    const hook = await createWebhook(
      ctx.organizerSlug,
      `${appUrl}/api/webhooks/pretix`,
      mapping.pretixEventSlug,
      ctx.token,
    );
    revalidatePath(`/${locale}/admin/data`);
    return { ok: true, message: `Registered webhook #${hook.id}. pretix will now notify this app.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
