import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { listMyRegistrations } from "@/lib/portal/account";

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  issued: { label: "Confirmed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  pending_approval: { label: "Under review", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pending_payment: { label: "Payment pending", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  rejected: { label: "Not approved", cls: "bg-destructive/10 text-destructive" },
  canceled: { label: "Canceled", cls: "bg-muted text-muted-foreground" },
};

export default async function MyRegistrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session) redirect(`/${locale}/login`);

  const rows = await listMyRegistrations(session);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My registrations</h1>
        <Link href={`/${locale}/profile`} className="text-sm text-primary underline-offset-4 hover:underline">
          Profile
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          You have no registrations yet.{" "}
          <Link href={`/${locale}/events`} className="text-primary underline">Browse events</Link>.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {rows.map((r) => {
            const badge = STATE_BADGE[r.state] ?? STATE_BADGE.canceled;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.event}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{r.orderCode}</span>
                    <span className={`rounded-full px-2 py-0.5 font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                </div>
                <Link
                  className="ms-4 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                  href={`/${locale}/t/${r.magicLinkToken}`}
                >
                  {r.state === "issued" ? "View ticket" : "View"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
