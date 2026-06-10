import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const CARDS: { href: string; title: string; desc: string }[] = [
  { href: "integrations", title: "Integrations", desc: "SMTP, WhatsApp, SMS, Whish, pretix — encrypted secrets, test & status." },
  { href: "api-keys", title: "API keys", desc: "Create and revoke scoped keys for the external /api/v1." },
  { href: "webhooks", title: "Webhooks", desc: "Outbound webhook endpoints, secrets, and test delivery." },
];

export default async function SettingsHub({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure integrations, API access, and webhooks for your organization.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={`/${locale}/admin/settings/${c.href}`}
            className="rounded-[var(--radius-lg)] border border-border p-4 hover:bg-muted"
          >
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
          </Link>
        ))}
      </div>
      <div className="mt-6 text-sm text-muted-foreground">
        See also:{" "}
        <Link className="text-primary underline" href={`/${locale}/admin/audit`}>Audit log</Link>
        {" · "}
        <Link className="text-primary underline" href={`/${locale}/admin/delete-queue`}>Delete queue</Link>
      </div>
    </div>
  );
}
