import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";
import { getEventForSession, listTickets } from "@/lib/events/service";
import { WalkInForm } from "./walk-in-form";

export const dynamic = "force-dynamic";

export default async function StaffRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { locale } = await params;
  const { event } = await searchParams;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session) return null;

  // Event chosen → render the walk-in form for it (access-checked).
  if (event) {
    const mapping = await getEventForSession(session, event);
    if (!mapping) {
      return <p className="text-muted-foreground">Event not found or access denied.</p>;
    }
    let tickets: { id: number; title: string; priceCents: number }[] = [];
    try {
      const items = await listTickets(session, event);
      tickets = items
        .filter((i) => i.active)
        .map((i) => ({
          id: i.id,
          title: locale === "ar" && i.titleAr ? i.titleAr : i.titleEn,
          priceCents: i.priceCents,
        }));
    } catch {
      tickets = [];
    }
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Walk-in registration</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mapping.titleEn}</p>
        <div className="mt-4">
          <WalkInForm locale={locale} eventId={mapping.id} tickets={tickets} />
        </div>
      </div>
    );
  }

  // No event → pick from accessible events.
  const all = await prisma.eventMapping.findMany({
    where: scopeWhere(session),
    orderBy: { createdAt: "desc" },
  });
  const events = all.filter((e) => canAccessEvent(session, e.organizationId, e.localEventId));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Walk-in registration</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose an event to register a walk-in attendee.</p>
      {events.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No assigned events.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/${locale}/staff/registrations?event=${e.id}`}
                className="block rounded-[var(--radius-lg)] border border-border p-4 hover:bg-muted"
              >
                <div className="font-medium">{e.titleEn}</div>
                <div className="text-sm text-muted-foreground">{e.pretixEventSlug}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
