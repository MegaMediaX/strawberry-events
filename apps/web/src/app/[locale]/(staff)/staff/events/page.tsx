import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";

export const dynamic = "force-dynamic";

export default async function StaffEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSessionContext();

  const all = session
    ? await prisma.eventMapping.findMany({ where: scopeWhere(session), orderBy: { createdAt: "desc" } })
    : [];
  const events = session
    ? all.filter((e) => canAccessEvent(session, e.organizationId, e.localEventId))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Events</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your assigned events. Open check-in or register a walk-in.</p>
      {events.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No assigned events.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border p-4"
            >
              <div>
                <div className="font-medium">{e.titleEn}</div>
                <div className="text-sm text-muted-foreground">{e.pretixEventSlug}</div>
              </div>
              <div className="flex gap-2 text-sm">
                <Link className="text-primary underline" href={`/${locale}/staff/checkin?event=${e.id}`}>
                  Check-in
                </Link>
                <Link className="text-primary underline" href={`/${locale}/staff/registrations?event=${e.id}`}>
                  Walk-in
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
