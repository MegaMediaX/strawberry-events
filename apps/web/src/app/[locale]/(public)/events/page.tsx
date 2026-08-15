import { setRequestLocale } from "next-intl/server";
import { listPublicEvents } from "@/lib/events/public";
import { EventCard, type EventCardData } from "@/components/public/event-card";
import { EventsHeroBanner } from "@/components/public/events-hero-banner";
import { coverImageUrl } from "@/lib/events/cover-image";
import { eventMetaLine } from "@/lib/events/format";
import { prisma } from "@/lib/db/client";
import type { EventMapping } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Earliest start and latest end across an event's sub-events, keyed by event id. */
type DateRange = { from: Date | null; to: Date | null };

async function loadDateRanges(eventIds: string[]): Promise<Map<string, DateRange>> {
  if (eventIds.length === 0) return new Map();
  // The listing has no dates of its own — pretix owns them and fetching per
  // event would mean one API call each. Sub-events already carry the real
  // schedule in our database, so the range is a single grouped query.
  const rows = await prisma.subEvent.groupBy({
    by: ["eventMappingId"],
    where: { eventMappingId: { in: eventIds } },
    _min: { dateFrom: true },
    _max: { dateTo: true },
  });
  return new Map(
    rows.map((r) => [r.eventMappingId, { from: r._min.dateFrom, to: r._max.dateTo }]),
  );
}

function toCardData(e: EventMapping, range: DateRange | undefined): EventCardData {
  return {
    slug: e.pretixEventSlug,
    titleEn: e.titleEn,
    titleAr: e.titleAr,
    visibility: e.visibility,
    comingSoon: e.comingSoon,
    coverUrl: e.coverImagePath ? coverImageUrl(e.coverImagePath) : null,
    metaLine: eventMetaLine(range?.from ?? null, range?.to ?? null, e.venueName),
    description: e.descriptionEn,
  };
}

export default async function EventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { open, comingSoon } = await listPublicEvents();
  const ranges = await loadDateRanges([...open, ...comingSoon].map((e) => e.id));

  // The first open event is the spotlight; the rest flow into a grid. With a
  // single event this reads as a featured statement rather than one small card
  // stranded in a large empty page.
  const [featured, ...rest] = open;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <EventsHeroBanner openCount={open.length} comingSoonCount={comingSoon.length} />

      {open.length === 0 ? (
        <div className="border-t border-border py-16">
          <p className="font-heading text-[28px] leading-tight">Nothing on sale right now</p>
          <p className="mt-2 max-w-[42ch] text-[15px] leading-[1.55] text-muted-foreground">
            There are no open events at the moment. Check back soon, or follow along for
            the next announcement.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          <EventCard
            locale={locale}
            featured
            event={toCardData(featured, ranges.get(featured.id))}
          />

          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2">
              {rest.map((e) => (
                <EventCard key={e.id} locale={locale} event={toCardData(e, ranges.get(e.id))} />
              ))}
            </div>
          )}
        </div>
      )}

      {comingSoon.length > 0 && (
        <section className="mt-20">
          <h2 className="border-b border-border pb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Coming soon
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((e) => (
              <EventCard key={e.id} locale={locale} event={toCardData(e, ranges.get(e.id))} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
