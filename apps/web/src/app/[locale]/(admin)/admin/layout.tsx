import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/auth/active-org.server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizerSwitcher } from "./_components/organizer-switcher";

const NAV = [
  { href: "", label: "Dashboard", financeAllowed: true },
  { href: "/events", label: "Events", financeAllowed: false },
  { href: "/approvals", label: "Approvals", financeAllowed: false },
  { href: "/registrations", label: "Registrations", financeAllowed: false },
  { href: "/finance", label: "Finance", financeAllowed: true },
  { href: "/staff", label: "Staff", financeAllowed: false },
  { href: "/settings", label: "Settings", financeAllowed: false },
  { href: "/settings/api-keys", label: "API keys", financeAllowed: false },
  { href: "/settings/webhooks", label: "Webhooks", financeAllowed: false },
];

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
    ["super_admin", "organizer_admin", "finance"],
    `/${locale}/login`,
  );

  const session = await getSessionContext();
  // Admins (super/org) see all nav; finance-only users see a reduced set.
  const isAdmin =
    !!session &&
    (session.isSuperAdmin ||
      session.memberships.some((m) => m.role === "organizer_admin"));
  const nav = NAV.filter((n) => isAdmin || n.financeAllowed);
  const activeOrg = session ? await getActiveOrg(session) : null;
  const orgs =
    session?.isSuperAdmin
      ? await prisma.organization.findMany({
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-e bg-muted/30 p-4">
        <div className="mb-6 text-lg font-bold">Strawberry</div>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={`/${locale}/admin${n.href}`}
              className="rounded-md px-3 py-2 hover:bg-muted"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm text-muted-foreground">
            {activeOrg?.name ?? "No organization"}
          </div>
          <div className="flex items-center gap-3">
            {session?.isSuperAdmin && orgs.length > 0 && (
              <OrganizerSwitcher orgs={orgs} activeOrgId={activeOrg?.id ?? null} />
            )}
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
