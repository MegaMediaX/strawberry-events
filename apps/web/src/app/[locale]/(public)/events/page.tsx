import { setRequestLocale } from "next-intl/server";
import { listPublicEvents } from "@/lib/events/public";
import { EventCard, type EventCardData } from "@/components/public/event-card";
import { EventsHeroBanner } from "@/components/public/events-hero-banner";
import { coverImageUrl } from "@/lib/events/cover-image";
import type { EventMapping } from "@prisma/client";

export const dynamic = "force-dynamic";

function toCardData(e: EventMapping): EventCardData {
  return {
    slug: e.pretixEventSlug,
    titleEn: e.titleEn,
    titleAr: e.titleAr,
    visibility: e.visibility,
    comingSoon: e.comingSoon,
    coverUrl: e.coverImagePath ? coverImageUrl(e.coverImagePath) : null,
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

  // Editorial hierarchy: the first open event is the full-bleed spotlight; any
  // remaining events flow into a grid beneath it. With a single event this
  // turns the page from "one tiny card in a void" into a featured statement.
  const [featured, ...rest] = open;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <EventsHeroBanner locale={locale} />

      {open.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No open events right now.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <EventCard locale={locale} featured event={toCardData(featured)} />

          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {rest.map((e, i) => (
                <EventCard key={e.id} locale={locale} index={i} event={toCardData(e)} />
              ))}
            </div>
          )}
        </div>
      )}

      {comingSoon.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {locale === "ar" ? "قريباً" : "Coming soon"}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((e, i) => (
              <EventCard key={e.id} locale={locale} index={i} event={toCardData(e)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
