import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { resolvePretixContext } from "@/lib/pretix/context";
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
  const autoListId = selectListIdForDate(days, lists, venueToday(VENUE_IANA_ZONE));
  const listId = sp.list ? Number(sp.list) : (autoListId ?? lists[0]?.id ?? 0);
  const activeList = lists.find((l) => l.id === listId) ?? null;
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
      <div className="mt-4">
        <CheckinPanel eventId={mapping.id} listId={listId} />
      </div>
    </div>
  );
}
