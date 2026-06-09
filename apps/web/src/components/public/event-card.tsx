import Link from "next/link";

export interface EventCardData {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  visibility: string;
  comingSoon: boolean;
}

export function EventCard({
  event,
  locale,
}: {
  event: EventCardData;
  locale: string;
}) {
  const title = locale === "ar" && event.titleAr ? event.titleAr : event.titleEn;
  const href = `/${locale}/events/${event.slug}`;

  const inner = (
    <div className="group overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm transition hover:shadow-md">
      <div
        className="h-28 w-full"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      />
      <div className="p-4">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{event.slug}</p>
        {event.comingSoon && (
          <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            Coming soon
          </span>
        )}
      </div>
    </div>
  );

  if (event.comingSoon) return <div className="opacity-80">{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}
