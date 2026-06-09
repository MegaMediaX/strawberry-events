import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { resolveOrgId } from "@/lib/admin/resolve-org";
import { getIntegration } from "@/lib/integrations/integration-service";
import { IntegrationForm, type FieldDef } from "./integration-form";

export async function renderProviderPage(
  locale: string,
  provider: string,
  title: string,
  description: string,
  fields: FieldDef[],
) {
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  const orgId = session ? await resolveOrgId(session) : null;
  const canEdit = !!session && !session.impersonating &&
    (session.isSuperAdmin || session.memberships.some((m) => m.organizationId === orgId && m.role === "organizer_admin"));

  const integ = session && orgId ? await getIntegration(session, orgId, provider) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6">
        {orgId ? (
          <IntegrationForm
            locale={locale}
            orgId={orgId}
            provider={provider}
            fields={fields}
            initial={integ?.config ?? {}}
            enabled={integ?.enabled ?? false}
            canEdit={canEdit}
          />
        ) : (
          <p className="text-muted-foreground">No organization available.</p>
        )}
      </div>
    </div>
  );
}
