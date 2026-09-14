import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { STAFF_ROLES } from "@/lib/auth/areas";
import { requireRole } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { prisma } from "@/lib/db/client";

const navLink =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground";

export default async function StaffLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole(
    STAFF_ROLES,
    `/${locale}/login`,
  );

  // Who is scanning. The first question asked of a check-in log afterwards,
  // and the thing a shared door laptop gives no other way to answer.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link href={`/${locale}/staff`} className="font-bold">
            Strawberry · Staff
          </Link>
          {/* Check-in is the job, so it leads — it used to be absent entirely,
              because the route refused to load without an event. It now offers
              a picker, so it can be linked like anything else. */}
          <nav aria-label="Staff" className="flex flex-wrap items-center gap-1">
            <Link href={`/${locale}/staff/checkin`} className={navLink}>
              Check-in
            </Link>
            <Link href={`/${locale}/staff/events`} className={navLink}>
              Events
            </Link>
            <Link href={`/${locale}/staff/registrations`} className={navLink}>
              Walk-in
            </Link>
            {/* Identity and the way out. A door laptop is handed between
                shifts, and there was no way to sign out of the staff area at
                all — the attendee nav has had one all along. */}
            <span className="mx-1 hidden max-w-[22ch] truncate text-sm text-muted-foreground sm:inline">
              {user?.name || user?.email}
            </span>
            <form action={signOutAction.bind(null, locale)}>
              <button type="submit" className={navLink}>
                Sign out
              </button>
            </form>
          </nav>
        </div>
        {/* Below sm the identity has nowhere to sit beside the links, and it is
            worth more than the horizontal space: a phone on a lane is exactly
            where the wrong account goes unnoticed. */}
        <p className="mt-0.5 max-w-full truncate text-xs text-muted-foreground sm:hidden">
          Signed in as {user?.name || user?.email}
        </p>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
