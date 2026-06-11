import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { listEmails } from "@/lib/admin/emails";

export const dynamic = "force-dynamic";

const STATUSES = ["", "sent", "failed", "disabled", "skipped", "queued"];
type SP = Record<string, string | undefined>;

export default async function EmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const rows = await listEmails(session, {
    status: sp.status || undefined,
    templateType: sp.template || undefined,
    q: sp.q || undefined,
  });
  const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-bold">Email log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Operational record of outbound email. No open/click tracking; statuses reflect real delivery attempts.</p>

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input className={sel} type="search" name="q" placeholder="Recipient / subject" defaultValue={sp.q ?? ""} />
        <select className={sel} name="status" defaultValue={sp.status ?? ""}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
        <input className={sel} type="text" name="template" placeholder="Template type" defaultValue={sp.template ?? ""} />
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" type="submit">Filter</button>
      </form>

      <p className="mt-3 text-sm text-muted-foreground">{rows.length} emails</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No email log entries.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Recipient</th><th>Subject</th><th>Template</th><th>Status</th><th>Provider</th><th>When</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2">{r.recipient}</td>
                <td>{r.subject}</td>
                <td className="text-xs">{r.templateType ?? "—"}</td>
                <td><span className={r.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{r.status}</span></td>
                <td className="text-xs">{r.provider}</td>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td><Link className="text-primary underline" href={`/${locale}/admin/emails/${r.id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
