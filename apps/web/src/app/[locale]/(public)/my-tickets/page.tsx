import Link from "next/link";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

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
      <h1 className="text-2xl font-bold">My tickets</h1>
      {orders.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No tickets yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-card p-4"
            >
              <div>
                <div className="font-medium">{o.eventMapping.titleEn}</div>
                <div className="text-sm text-muted-foreground">
                  Order {o.orderCode} · {o.status}
                </div>
              </div>
              <Link
                className="text-sm text-primary underline"
                href={`/${locale}/t/${o.magicLinkToken}`}
              >
                View ticket
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
