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
    <div className="group overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="h-36 w-full"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      />
      <div className="p-4">
        <h3 className="text-lg font-semibold leading-snug tracking-tight">{title}</h3>
        <div className="mt-2">
          {event.comingSoon ? (
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              Coming soon
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              Open
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (event.comingSoon) return <div className="cursor-default opacity-75">{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}
