import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Ticket } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { registrationState } from "@/lib/approval/state";

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  issued: { label: "Confirmed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  pending_approval: { label: "Under review", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pending_payment: { label: "Payment pending", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  rejected: { label: "Not approved", cls: "bg-destructive/10 text-destructive" },
  canceled: { label: "Canceled", cls: "bg-muted text-muted-foreground" },
};

export default async function MyTicketsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionContext();
  if (!session) redirect(`/${locale}/login`);

  const orders = await prisma.attendeeOrder.findMany({
    where: { userId: session.userId },
    include: { eventMapping: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">My tickets</h1>

      {orders.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Ticket className="h-10 w-10 opacity-30" />
          <p className="text-sm">No tickets yet. Browse events to get started.</p>
          <Link
            href={`/${locale}/events`}
            className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {orders.map((o) => {
            const state = registrationState(o);
            const badge = STATE_BADGE[state] ?? STATE_BADGE.canceled;
            return (
              <li
                key={o.id}
                className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{o.eventMapping.titleEn}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{o.orderCode}</span>
                    <span className={`rounded-full px-2 py-0.5 font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                <Link
                  className="ms-4 shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                  href={`/${locale}/t/${o.magicLinkToken}`}
                >
                  View
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
