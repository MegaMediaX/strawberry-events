import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Gate: only super admins and organizer admins. Redirects to login when
  // unauthenticated; throws ForbiddenError otherwise.
  const ctx = await requireRole(
    ["super_admin", "organizer_admin"],
    `/${locale}/login`,
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {ctx.userId}
        {ctx.isSuperAdmin ? " (super admin)" : ""}.
      </p>
    </main>
  );
}
