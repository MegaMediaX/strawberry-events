"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface EventCardData {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  visibility: string;
  comingSoon: boolean;
  coverUrl?: string | null;
  /** "28—30 Aug 2026 · Le Royal Hotel Beirut", already composed. */
  metaLine?: string | null;
  /** Shown on the featured entry only, clamped to three lines. */
  description?: string | null;
}

/**
 * An event entry: cover band, then type beneath it.
 *
 * The previous version stacked the title, status pill and CTA *on top of* the
 * cover behind a scrim. Event posters are admin-uploaded and already carry
 * their own headline, dates and venue, so the overlay collided with the
 * artwork's own typography and neither read cleanly. A scrim solves contrast,
 * which was never the real problem — composition was. Type below the image
 * also means an unknown crop can never break the headline.
 */
export function EventCard({
  event,
  locale,
  featured = false,
}: {
  event: EventCardData;
  locale: string;
  /** Wider band and larger display type — used for the first / only event. */
  featured?: boolean;
}) {
  const title = event.titleEn;
  const href = `/${locale}/events/${event.slug}`;

  const band = (
    <div
      className={[
        "overflow-hidden rounded-[var(--radius-xl)] bg-muted",
        // 16/9 at every width. A 21/9 band cropped 36% off this event's 3:2
        // poster — it survived only because that artwork happens to be centred
        // with margin. Covers are admin-uploaded at arbitrary ratios, so the
        // band stays close to the ratios posters are actually made at.
        "aspect-[16/9]",
      ].join(" ")}
    >
      {event.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverUrl}
          alt=""
          // The featured cover is the LCP element; grid covers stay lazy.
          loading={featured ? "eager" : "lazy"}
          fetchPriority={featured ? "high" : "auto"}
          decoding="async"
          className="h-full w-full object-cover object-center transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          style={{ filter: "saturate(0.9) contrast(1.03)" }}
        />
      ) : (
        <div
          className="h-full w-full"
          style={{ backgroundImage: "var(--gradient-hero-strong)" }}
        />
      )}
    </div>
  );

  const body = (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase",
            event.comingSoon
              ? "bg-muted text-muted-foreground"
              : "bg-[color-mix(in_oklab,var(--brand-success)_14%,transparent)] text-[var(--brand-success)]",
          ].join(" ")}
        >
          {event.comingSoon ? "Coming soon" : "Open"}
        </span>
      </div>

      <h2
        className={[
          "font-heading leading-[1.02] tracking-[-0.02em]",
          featured ? "text-[40px] sm:text-[60px]" : "text-[24px]",
        ].join(" ")}
      >
        {title}
      </h2>

      {event.metaLine && (
        <p className="text-[13px] font-medium tracking-[0.04em] text-muted-foreground uppercase tabular-nums">
          {event.metaLine}
        </p>
      )}

      {featured && event.description && (
        <p className="mt-1 line-clamp-3 max-w-[52ch] text-[15px] leading-[1.55] text-muted-foreground">
          {event.description}
        </p>
      )}

      {!event.comingSoon && (
        <span
          className={[
            "mt-2 inline-flex items-center gap-1.5 self-start rounded-lg text-sm font-semibold",
            featured
              ? "h-11 bg-primary px-5 text-primary-foreground transition-colors group-hover:bg-primary/85"
              : "",
          ].join(" ")}
        >
          {featured ? "View event and register" : "View event"}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
        </span>
      )}
    </div>
  );

  if (event.comingSoon) {
    return (
      <div className="group cursor-default opacity-70">
        {band}
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label={title}
      className="group block rounded-[var(--radius-xl)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {band}
      {body}
    </Link>
  );
}
