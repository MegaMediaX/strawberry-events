import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";

export default async function StaffLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(
    ["super_admin", "organizer_admin", "checkin_staff"],
    `/${locale}/login`,
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href={`/${locale}/staff`} className="font-bold">
          Strawberry · Staff
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href={`/${locale}/staff/events`} className="hover:underline">Events</Link>
          <Link href={`/${locale}/staff/registrations`} className="hover:underline">Walk-in</Link>
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
