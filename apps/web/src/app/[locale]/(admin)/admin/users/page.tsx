import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { listUsers, invitableOrgs, grantableRoles } from "@/lib/admin/users";
import { InviteUserForm } from "./invite-user-form";

export const dynamic = "force-dynamic";

const ROLES = ["", "super_admin", "organizer_admin", "finance", "checkin_staff"];

type SP = Record<string, string | undefined>;

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const [users, orgs] = await Promise.all([
    listUsers(session, { q: sp.q, role: sp.role }),
    invitableOrgs(session),
  ]);
  const roles = grantableRoles(session);
  const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-bold">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">Staff and admins you can manage.</p>

      <InviteUserForm locale={locale} orgs={orgs} roles={roles} />

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input className={sel} type="search" name="q" placeholder="Name / email" defaultValue={sp.q ?? ""} />
        <select className={sel} name="role" defaultValue={sp.role ?? ""}>
          {ROLES.map((r) => <option key={r} value={r}>{r || "All roles"}</option>)}
        </select>
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" type="submit">Filter</button>
      </form>

      <p className="mt-3 text-sm text-muted-foreground">{users.length} users</p>
      {users.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No users match.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Name</th><th>Email</th><th>Status</th><th>Roles</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border">
                <td className="py-2">{u.name ?? "—"}</td>
                <td>{u.email}</td>
                <td>
                  <span className={u.status === "suspended" ? "text-destructive" : "text-muted-foreground"}>
                    {u.status}
                  </span>
                </td>
                <td className="text-xs">{u.memberships.map((m) => m.role).join(", ") || "—"}</td>
                <td><Link className="text-primary underline" href={`/${locale}/admin/users/${u.id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
