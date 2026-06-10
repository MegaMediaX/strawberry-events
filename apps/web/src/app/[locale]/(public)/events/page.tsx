import { setRequestLocale } from "next-intl/server";
import { listPublicEvents } from "@/lib/events/public";
import { EventCard } from "@/components/public/event-card";
import { EventsHeroBanner } from "@/components/public/events-hero-banner";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { open, comingSoon } = await listPublicEvents();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <EventsHeroBanner locale={locale} />

      {open.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No open events right now.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((e) => (
            <EventCard
              key={e.id}
              locale={locale}
              event={{
                slug: e.pretixEventSlug,
                titleEn: e.titleEn,
                titleAr: e.titleAr,
                visibility: e.visibility,
                comingSoon: e.comingSoon,
              }}
            />
          ))}
        </div>
      )}

      {comingSoon.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Coming soon
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((e) => (
              <EventCard
                key={e.id}
                locale={locale}
                event={{
                  slug: e.pretixEventSlug,
                  titleEn: e.titleEn,
                  titleAr: e.titleAr,
                  visibility: e.visibility,
                  comingSoon: e.comingSoon,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
