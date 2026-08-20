import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ADMIN_ROLES } from "@/lib/auth/areas";
import { requireRole } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/auth/active-org.server";
import { getSessionContext } from "@/lib/auth/session";
import { subEventScope } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/db/client";
import { OrganizerSwitcher } from "./_components/organizer-switcher";
import { NavItem } from "@/components/admin/nav-item";
import { Toaster } from "@/components/ui/toast";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(
    ADMIN_ROLES,
    `/${locale}/login`,
  );

  const session = await getSessionContext();
  const isAdmin =
    !!session &&
    (session.isSuperAdmin ||
      session.memberships.some((m) => m.role === "organizer_admin"));
  // A workshop organiser sees one thing: the registrations for their own
  // sessions. Everything else in this nav is either another organiser's data or
  // an admin surface, so it is hidden rather than merely guarded — a link that
  // bounces you to a redirect reads as a broken app.
  const sessionScoped = !!session && subEventScope(session) !== null;
  const activeOrg = session ? await getActiveOrg(session) : null;
  const orgs =
    session?.isSuperAdmin
      ? await prisma.organization.findMany({
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const base = `/${locale}/admin`;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-e border-border bg-muted/20">
        <div className="px-4 py-5">
          <Link
            href={`/${locale}/events`}
            className="bg-[image:var(--gradient-hero)] bg-clip-text text-lg font-extrabold tracking-tight text-transparent"
          >
            Strawberry
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-1">
            {!sessionScoped && (
              <NavItem href={base} label="Dashboard" icon="LayoutDashboard" />
            )}
            {isAdmin && !sessionScoped && (
              <NavItem href={`${base}/events`} label="Events" icon="CalendarDays" />
            )}
            {isAdmin && !sessionScoped && (
              <NavItem href={`${base}/approvals`} label="Approvals" icon="CheckSquare" />
            )}
            <NavItem href={`${base}/registrations`} label="Registrations" icon="Users" />
            {isAdmin && (
              <NavItem href={`${base}/users`} label="Users" icon="UserCog" />
            )}
            {!sessionScoped && (
              <NavItem href={`${base}/finance`} label="Finance" icon="DollarSign" />
            )}
          </div>

          <div className="mt-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Operations
            </p>
            {!sessionScoped && (
              <NavItem
                href={`/${locale}/staff/events`}
                label="Staff check-in"
                icon="CheckSquare"
              />
            )}
            {!sessionScoped && (
              <NavItem href={`${base}/emails`} label="Emails" icon="Mail" />
            )}
            {isAdmin && (
              <NavItem href={`${base}/data`} label="Data" icon="Database" />
            )}
            {isAdmin && (
              <NavItem href={`${base}/audit`} label="Audit log" icon="Shield" />
            )}
            {isAdmin && (
              <NavItem href={`${base}/delete-queue`} label="Delete queue" icon="Trash2" />
            )}
          </div>

          {isAdmin && (
            <div className="mt-4">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Settings
              </p>
              <NavItem href={`${base}/settings`} label="General" icon="Settings" />
              <NavItem href={`${base}/settings/api-keys`} label="API keys" icon="Key" />
              <NavItem href={`${base}/settings/webhooks`} label="Webhooks" icon="Webhook" />
              <NavItem
                href={`${base}/settings/integrations`}
                label="Integrations"
                icon="Puzzle"
              />
            </div>
          )}
        </nav>

        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {activeOrg?.name ?? "No organization"}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
          <div />
          <div className="flex items-center gap-3">
            {session?.isSuperAdmin && orgs.length > 0 && (
              <OrganizerSwitcher orgs={orgs} activeOrgId={activeOrg?.id ?? null} />
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
