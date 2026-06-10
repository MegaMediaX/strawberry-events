import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { resolveOrgId } from "@/lib/admin/resolve-org";
import { listWebhooks } from "@/lib/webhooks/admin-service";
import { WebhookManager, type WebhookRow } from "./webhook-manager";

export const dynamic = "force-dynamic";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  const orgId = session ? await resolveOrgId(session) : null;

  const webhooks = orgId && session ? await listWebhooks(session, orgId) : [];
  const rows: WebhookRow[] = webhooks.map((w) => ({
    id: w.id, url: w.url, events: w.events, active: w.active,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Webhooks</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Outbound HMAC-signed event notifications. Verify with the signing secret.
      </p>
      <div className="mt-6">
        {orgId ? (
          <WebhookManager
            locale={locale}
            organizationId={orgId}
            webhooks={rows}
            canManage={!session?.impersonating}
          />
        ) : (
          <p className="text-muted-foreground">No organization available.</p>
        )}
      </div>
    </div>
  );
}
