import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getUserDetail } from "@/lib/admin/users";
import { prisma } from "@/lib/db/client";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  let user;
  try {
    user = await getUserDetail(session, id);
  } catch {
    notFound();
  }

  // Orgs the actor may assign within.
  const adminOrgIds = session.isSuperAdmin
    ? null
    : [...new Set(session.memberships.filter((m) => m.role === "organizer_admin").map((m) => m.organizationId))];
  const orgs = await prisma.organization.findMany({
    where: adminOrgIds ? { id: { in: adminOrgIds } } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link className="text-sm text-primary underline" href={`/${locale}/admin/users`}>← Users</Link>
      <h1 className="mt-2 text-2xl font-bold">{user.name ?? user.email}</h1>
      <p className="text-sm text-muted-foreground">
        {user.email} · <span className={user.status === "suspended" ? "text-destructive" : ""}>{user.status}</span>
      </p>

      <section className="mt-6">
        <h2 className="font-semibold">Memberships</h2>
        {user.memberships.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No organization memberships.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Organization</th><th>Role</th></tr></thead>
            <tbody>
              {user.memberships.map((m) => (
                <tr key={m.id} className="border-b border-border">
                  <td className="py-1.5">{orgs.find((o) => o.id === m.organizationId)?.name ?? m.organizationId}</td>
                  <td>{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Manage</h2>
        <UserActions
          userId={user.id}
          suspended={user.status === "suspended"}
          isSuper={session.isSuperAdmin}
          orgs={orgs}
        />
      </section>
    </div>
  );
}
