import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { resolveOrgId } from "@/lib/admin/resolve-org";
import { getSmtp } from "@/lib/integrations/smtp-service";
import { SmtpForm, type SmtpInitial } from "./smtp-form";

export const dynamic = "force-dynamic";

export default async function SmtpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  const orgId = session ? await resolveOrgId(session) : null;
  const canEdit = !!session && !session.impersonating &&
    (session.isSuperAdmin || session.memberships.some((m) => m.organizationId === orgId && m.role === "organizer_admin"));

  let initial: SmtpInitial | null = null;
  if (session && orgId) {
    const s = await getSmtp(session, orgId);
    if (s) initial = { ...s, lastTestedAt: s.lastTestedAt?.toISOString() ?? null };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">SMTP</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Outbound email. The password is encrypted at rest and never displayed after saving.
        In non-production, missing SMTP falls back to the dev-log transport.
      </p>
      <div className="mt-6">
        {orgId ? (
          <SmtpForm locale={locale} orgId={orgId} initial={initial} canEdit={canEdit} />
        ) : (
          <p className="text-muted-foreground">No organization available.</p>
        )}
      </div>
    </div>
  );
}
