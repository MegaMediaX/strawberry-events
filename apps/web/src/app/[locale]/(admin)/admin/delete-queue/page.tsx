import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { listQueue } from "@/lib/archive/service";
import { QueueActions } from "./queue-actions";

export const dynamic = "force-dynamic";

export default async function DeleteQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  const rows = session ? await listQueue(session) : [];
  const canPurge = !!session && !session.impersonating;

  return (
    <div>
      <h1 className="text-2xl font-bold">Archive / delete queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Soft-archived records are recoverable for 14 days, then eligible for purge of the local
        snapshot. pretix orders are never destructively deleted.
      </p>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Type</th><th>Target</th><th>Requested</th><th>Purge after</th><th>Status</th><th>Reason</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.entityType}</td>
              <td>{r.targetName ?? r.entityId.slice(0, 8)}</td>
              <td>{new Date(r.archivedAt).toLocaleDateString()}</td>
              <td>{new Date(r.purgeAfter).toLocaleDateString()}</td>
              <td>{r.status}</td>
              <td className="max-w-[12rem] truncate text-xs">{r.reason ?? ""}</td>
              <td className="text-end">
                <QueueActions locale={locale} id={r.id} status={r.status} canPurge={canPurge} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-4 text-muted-foreground">Queue is empty.</p>}
    </div>
  );
}
