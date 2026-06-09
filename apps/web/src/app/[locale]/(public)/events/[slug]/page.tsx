import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPublicEvent } from "@/lib/events/public";
import { capacityState } from "@/lib/events/capacity";
import { EventHero } from "@/components/public/event-hero";
import { TicketRail } from "@/components/public/ticket-rail";
import { MobileCtaBar } from "@/components/public/mobile-cta-bar";
import { WaitlistJoin } from "@/components/public/waitlist-join";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const data = await getPublicEvent(slug);
  if (!data) notFound();
  const { event, tickets, capacity, dateFrom, dateTo } = data;

  const title = locale === "ar" && event.titleAr ? event.titleAr : event.titleEn;
  const description =
    locale === "ar" && event.descriptionAr
      ? event.descriptionAr
      : event.descriptionEn;
  const soldOut = capacityState(capacity.sold, capacity.total) === "sold_out";
  const fromCents = tickets.length
    ? Math.min(...tickets.map((t) => t.priceCents))
    : null;
  const calendar = {
    title: event.titleEn,
    start: dateFrom ?? new Date().toISOString(),
    end: dateTo,
    description: event.descriptionEn,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-24 lg:pb-8">
      <EventHero
        title={title}
        dateLabel={fmtDate(dateFrom)}
        locationLabel={null}
        statusLabel={
          event.comingSoon ? "Coming soon" : soldOut ? "Sold out" : "Open"
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {description && (
            <section>
              <h2 className="text-lg font-semibold">About</h2>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {description}
              </p>
            </section>
          )}
          {event.waitlistEnabled && soldOut && (
            <section className="mt-6">
              <WaitlistJoin eventId={event.id} />
            </section>
          )}
          {/* Agenda / Speakers / Partners render here when content exists (later milestones). */}
        </div>

        <aside>
          <TicketRail
            locale={locale}
            slug={slug}
            tickets={tickets}
            capacity={capacity}
            calendar={calendar}
            soldOut={soldOut}
          />
        </aside>
      </div>

      <MobileCtaBar locale={locale} slug={slug} fromCents={fromCents} soldOut={soldOut} />
    </main>
  );
}
