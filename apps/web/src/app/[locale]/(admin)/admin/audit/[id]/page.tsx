import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEntry } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

export default async function AuditDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  const e = session ? await getEntry(session, id) : null;
  if (!e) notFound();

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-3 border-b py-2 text-sm">
      <div className="w-40 text-muted-foreground">{k}</div>
      <div className="flex-1 break-all">{v}</div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Audit entry</h1>
      <div className="mt-4">
        <Row k="Action" v={e.action} />
        <Row k="Result" v={e.success ? "success" : "failure"} />
        <Row k="Actor" v={e.actor?.email ?? "system"} />
        <Row k="Impersonated" v={e.impersonatedUserId ?? "—"} />
        <Row k="Organization" v={e.organizationId ?? "—"} />
        <Row k="Event" v={e.eventMappingId ?? "—"} />
        <Row k="Target" v={`${e.entityType}:${e.entityId}`} />
        <Row k="Time" v={new Date(e.createdAt).toLocaleString()} />
        <Row k="IP / UA" v={`${e.ipAddress ?? "—"} / ${e.userAgent ?? "—"}`} />
        <Row k="Before" v={<pre className="text-xs">{e.before ? JSON.stringify(e.before, null, 2) : "—"}</pre>} />
        <Row k="After" v={<pre className="text-xs">{e.after ? JSON.stringify(e.after, null, 2) : "—"}</pre>} />
      </div>
    </div>
  );
}
