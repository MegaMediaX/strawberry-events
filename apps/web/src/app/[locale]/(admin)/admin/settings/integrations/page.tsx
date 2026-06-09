import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { resolveOrgId } from "@/lib/admin/resolve-org";
import { getSmtp } from "@/lib/integrations/smtp-service";
import { getIntegration } from "@/lib/integrations/integration-service";

export const dynamic = "force-dynamic";

const PROVIDERS: { key: string; label: string; href: string }[] = [
  { key: "smtp", label: "SMTP (email)", href: "smtp" },
  { key: "whatsapp", label: "WhatsApp", href: "whatsapp" },
  { key: "sms", label: "SMS", href: "sms" },
  { key: "whish", label: "Whish (payments)", href: "whish-placeholder" },
  { key: "pretix", label: "pretix", href: "pretix" },
];

export default async function IntegrationsHub({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  const orgId = session ? await resolveOrgId(session) : null;

  const rows: { key: string; label: string; href: string; status: string; lastError: string | null }[] = [];
  if (session && orgId) {
    for (const p of PROVIDERS) {
      try {
        if (p.key === "smtp") {
          const s = await getSmtp(session, orgId);
          rows.push({ ...p, status: s ? "configured" : "not set", lastError: s?.lastError ?? null });
        } else {
          const i = await getIntegration(session, orgId, p.key);
          rows.push({
            ...p,
            status: i ? (i.enabled ? "enabled" : "configured") : "not set",
            lastError: i?.lastError ?? null,
          });
        }
      } catch {
        rows.push({ ...p, status: "—", lastError: null });
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Integrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure email, messaging, payments, and pretix. Secrets are encrypted and never shown after saving.
      </p>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Provider</th><th>Status</th><th>Last error</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b">
              <td className="py-2">{r.label}</td>
              <td>{r.status}</td>
              <td className="max-w-[16rem] truncate text-xs text-destructive">{r.lastError ?? ""}</td>
              <td className="text-end">
                <Link className="text-primary underline" href={`/${locale}/admin/settings/integrations/${r.href}`}>
                  Configure
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-8 rounded-[var(--radius-lg)] border border-border p-4">
        <h2 className="font-medium">Reminders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminder channels (email/WhatsApp/SMS) and timing offsets (24h, 1h before) are modeled
          via <code>ReminderSetting</code>. Scheduling is wired in a later milestone.
        </p>
      </section>
    </div>
  );
}
