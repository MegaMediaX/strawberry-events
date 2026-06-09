import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { query } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; entityType?: string; success?: string; impersonation?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();

  const entries = session
    ? await query(session, {
        action: sp.action || undefined,
        entityType: sp.entityType || undefined,
        success: sp.success === "true" ? true : sp.success === "false" ? false : undefined,
        impersonationOnly: sp.impersonation === "true",
      })
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit log</h1>
      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="get">
        <input name="action" defaultValue={sp.action ?? ""} placeholder="action (e.g. apikey.created)"
          className="rounded-md border border-border bg-background p-2" />
        <input name="entityType" defaultValue={sp.entityType ?? ""} placeholder="entity type"
          className="rounded-md border border-border bg-background p-2" />
        <select name="success" defaultValue={sp.success ?? ""} className="rounded-md border border-border bg-background p-2">
          <option value="">any result</option><option value="true">success</option><option value="false">failure</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="impersonation" value="true" defaultChecked={sp.impersonation === "true"} /> impersonation only
        </label>
        <button className="rounded-md bg-primary px-3 text-primary-foreground" type="submit">Filter</button>
      </form>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="py-2">{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.actor?.email ?? "system"}{e.impersonatedUserId ? " (impersonating)" : ""}</td>
              <td>{e.action}</td>
              <td className="text-xs">{e.entityType}:{e.entityId.slice(0, 8)}</td>
              <td>{e.success ? "ok" : "fail"}</td>
              <td className="text-end">
                <Link className="text-primary underline" href={`/${locale}/admin/audit/${e.id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p className="mt-4 text-muted-foreground">No matching audit entries.</p>}
    </div>
  );
}
