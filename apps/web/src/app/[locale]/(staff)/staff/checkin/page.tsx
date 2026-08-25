import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listTickets } from "@/lib/events/service";
import { listCheckinLists, checkinCounters } from "@/lib/pretix/checkin";
import { selectListIdForDate, venueToday } from "@/lib/checkin/select-list";
import { VENUE_IANA_ZONE } from "@/lib/datetime/uk";
import { CheckinPanel } from "./checkin-panel";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string; list?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session || !sp.event) notFound();

  const mapping = await prisma.eventMapping.findUnique({ where: { id: sp.event } });
  if (!mapping || !canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    notFound();
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: mapping.organizationId } });
  const ctx = resolvePretixContext(org);

  let lists: { id: number; name: string }[] = [];
  let counters = { total: 0, checkedIn: 0 };
  try {
    lists = await listCheckinLists(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token);
  } catch {
    lists = [];
  }
  // Pick the list for whatever day it is at the venue. An explicit ?list= still
  // wins — it is the manual override for reprints, reconciliation, or the day a
  // reality does not match the schedule — but nobody has to remember it.
  // Every session, not just one category — selectListIdForDate reduces these to
  // distinct venue DATES, so this works regardless of how categories are named.
  const days = await prisma.subEvent.findMany({
    where: { eventMappingId: mapping.id },
    select: { dateFrom: true },
    orderBy: { dateFrom: "asc" },
  });
  const today = venueToday(VENUE_IANA_ZONE);
  const autoListId = selectListIdForDate(days, lists, today);
  const listId = sp.list ? Number(sp.list) : (autoListId ?? lists[0]?.id ?? 0);
  const activeList = lists.find((l) => l.id === listId) ?? null;
  // An explicit ?list= that matches nothing pretix returned. Stale bookmark,
  // retyped URL, or a list deleted since. Without this the page looks healthy
  // — no list name, "0 / 0" counters from a swallowed error — while every
  // scan fails against pretix with a message the door has no context for.
  const unknownList = Boolean(sp.list) && lists.length > 0 && !activeList;

  // Ticket types for the door's walk-in form. Swallowed like the check-in lists
  // above: pretix being unreachable must not take the check-in screen down, it
  // just means walk-ins have to be registered from the desk page instead.
  let tickets: { id: number; title: string }[] = [];
  try {
    tickets = (await listTickets(session, mapping.id))
      .filter((i) => i.active)
      .map((i) => ({ id: i.id, title: locale === "ar" && i.titleAr ? i.titleAr : i.titleEn }));
  } catch {
    tickets = [];
  }
  // Only call a list "today" when today is actually an event day.
  // selectListIdForDate deliberately clamps outside the window (day one for
  // rehearsal, the last day for reconciliation), and labelling that "today"
  // on the 27th or the 31st would be a confident lie.
  const dayKeys = days
    .map((d) => (d.dateFrom instanceof Date ? d.dateFrom.toISOString() : String(d.dateFrom)).slice(0, 10))
    .sort();
  const withinEvent =
    dayKeys.length > 0 && today >= dayKeys[0] && today <= dayKeys[dayKeys.length - 1];
  if (listId) {
    try {
      counters = await checkinCounters(ctx.organizerSlug, mapping.pretixEventSlug, listId, ctx.token);
    } catch {
      // counters best-effort
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{mapping.titleEn} — Check-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Checked in {counters.checkedIn} / {counters.total}
        {listId ? "" : " · no check-in list configured in pretix"}
      </p>
      {/* Name the active list. The day is chosen automatically, so this is the
          only way staff can spot a wrong-day session before it turns into a
          queue of "already redeemed" refusals at the door. */}
      {activeList && (
        <p className="mt-0.5 text-sm font-medium">{activeList.name}</p>
      )}
      {/* Auto-selection declined — the session dates and the check-in lists no
          longer line up (usually an extra session added on a new date). The
          page has silently fallen back to the FIRST list, which is the exact
          behaviour that refuses returning attendees on later days. Say so
          loudly: a quiet fallback here looks identical to working correctly. */}
      {autoListId === null && lists.length > 1 && !sp.list && (
        <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not match today to a check-in list ({days.length} session date
          {days.length === 1 ? "" : "s"} vs {lists.length} lists), so
          <span className="font-semibold"> {activeList?.name ?? "the first list"} </span>
          is selected. Confirm this is today&apos;s list before scanning, and
          pick the right day below if it is wrong.
        </p>
      )}
      {unknownList && (
        <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          List <span className="font-mono">{sp.list}</span> is not a check-in
          list for this event, so scans will fail. Pick the right day below.
        </p>
      )}
      {/* Day switcher. The list is chosen automatically and that is nearly
          always right, so this exists for the times it is not: a rehearsal on
          the wrong date, a reprint against yesterday, reconciliation after the
          event. Before this, overriding meant hand-editing a ?list= query
          param at the door — which nobody does at 8am with a queue forming.

          next/link, NOT a plain anchor. A plain <a> is a full document load,
          which remounts CheckinPanel: scan mode resets to search, the camera
          has to be re-acquired, and an in-flight check-in loses the handler
          that prints the badge. Client navigation keeps the panel mounted, so
          switching days does not interrupt a scan session or strand someone
          mid-redemption. (The "works without JavaScript" argument does not
          apply here — CheckinPanel is a client component, so every control on
          this screen is already inert until hydration.)

          Targets are 44px for gloved, hurried taps on a handheld. */}
      {lists.length > 1 && (
        <nav aria-label="Check-in day" className="mt-3 flex flex-wrap gap-2">
          {[...lists]
            .sort((a, b) => a.id - b.id)
            .map((l) => {
              const isActive = l.id === listId;
              return (
                <Link
                  key={l.id}
                  href={`?event=${encodeURIComponent(mapping.id)}&list=${l.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-[var(--radius-md)] border px-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  {l.name}
                  {withinEvent && l.id === autoListId && (
                    <span
                      className={`ml-2 text-xs font-normal ${
                        isActive ? "opacity-80" : "text-muted-foreground"
                      }`}
                    >
                      today
                    </span>
                  )}
                </Link>
              );
            })}
        </nav>
      )}
      <div className="mt-4">
        <CheckinPanel eventId={mapping.id} listId={listId} tickets={tickets} />
      </div>
    </div>
  );
}
