import { setRequestLocale } from "next-intl/server";
import { listPublicEvents } from "@/lib/events/public";
import { EventCard, type EventCardData } from "@/components/public/event-card";
import { FeaturedEventPlate } from "@/components/public/featured-event-plate";
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
    <main className="pb-20">
      {/* The column is applied per-section, not to <main>, because the
          featured plate has to escape it: the opening shot is full-bleed and
          everything else stays in the 1024px measure. */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <EventsHeroBanner openCount={open.length} comingSoonCount={comingSoon.length} />
      </div>

      {open.length === 0 ? (
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="border-t border-border py-16">
            {/* The page's h1 in this branch. With no featured event there is
                no title card, and a page without an h1 is not an option. */}
            <h1 className="font-heading text-[length:var(--display-3)] leading-tight">
              Nothing on sale right now
            </h1>
            <p className="mt-2 max-w-[42ch] text-[15px] leading-[1.55] text-muted-foreground">
              There are no open events at the moment. Check back soon, or follow along for
              the next announcement.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 sm:mt-8">
            <FeaturedEventPlate
              locale={locale}
              event={toCardData(featured, ranges.get(featured.id))}
            />
          </div>

          {rest.length > 0 && (
            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-x-8 gap-y-12 px-4 sm:grid-cols-2 sm:px-6">
              {rest.map((e) => (
                <EventCard key={e.id} locale={locale} event={toCardData(e, ranges.get(e.id))} />
              ))}
            </div>
          )}
        </>
      )}

      {comingSoon.length > 0 && (
        <section className="mx-auto mt-20 max-w-5xl px-4 sm:px-6">
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
