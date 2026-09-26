"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { coverFocus, focusPosition } from "@/lib/events/cover-focus";
import { dissolve } from "@/lib/motion";
import { Stamp } from "@/components/paper/stamp";

export interface EventCardData {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  visibility: string;
  comingSoon: boolean;
  coverUrl?: string | null;
  /** "28—30 Aug 2026 · Le Royal Hotel Beirut", already composed. */
  metaLine?: string | null;
  /**
   * Which part of the cover survives the crop, as percentages. Every surface
   * that shows this event's picture reads the same pair, so the index, the
   * hero and the link preview cannot disagree about what the picture is of.
   */
  focusX?: number | null;
  focusY?: number | null;
  /**
   * The cover's pixel size, recorded at upload. Where a surface shows the
   * poster WHOLE rather than cropping it, this is what reserves its space
   * before the image arrives — without it the page jumps when it loads.
   * Null for covers uploaded before sizes were recorded.
   */
  coverWidth?: number | null;
  coverHeight?: number | null;
}

/**
 * An event entry in the grid: cover band, then type beneath it.
 *
 * The previous version stacked the title, status pill and CTA *on top of* the
 * cover behind a scrim. Event posters are admin-uploaded and already carry
 * their own headline, dates and venue, so the overlay collided with the
 * artwork's own typography and neither read cleanly. A scrim solves contrast,
 * which was never the real problem — composition was. Type below the image
 * also means an unknown crop can never break the headline.
 *
 * The featured entry no longer comes through here. It had grown a `featured`
 * branch in six places — band ratio, loading priority, type size, description,
 * button shape, button label — describing a layout this one never was, and the
 * opening shot it has to be now (full-bleed, title over the frame, one red
 * action) shares no markup with a card. It lives in `featured-event-plate.tsx`
 * and this file is the grid again.
 */
export function EventCard({ event, locale }: { event: EventCardData; locale: string }) {
  // The card takes titleAr and then ignored it. The Arabic locale is retired
  // (lib/i18n/dir.ts), so this changes nothing today — but a branch kept for
  // the day it returns has to actually work on that day.
  const title = locale === "ar" && event.titleAr ? event.titleAr : event.titleEn;
  const href = `/${locale}/events/${event.slug}`;

  const band = (
    <div
      className={[
        // The frame, not the stock: paper-edge draws the printed rule and
        // squares the corners WITHOUT painting a background, because this
        // element already has one. A full plate here would emit two background
        // declarations of equal specificity and let stylesheet order decide
        // which showed through behind a cover that failed to load.
        "paper-edge overflow-hidden bg-muted",
        // 16/9: a grid thumbnail is an index entry, and posters are made
        // close to this shape. The ONE place a cover is still cropped — the
        // homepage feature and the event page show it whole (poster.tsx) — so
        // this is the crop the admin's focal-point preview draws.
        "aspect-[16/9]",
      ].join(" ")}
    >
      {event.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          style={{
            objectPosition: focusPosition(coverFocus(event.focusX, event.focusY)),
            filter: "saturate(0.9) contrast(1.03)",
          }}
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
        {/* The same mark the ticket carries, so a state reads the same on the
            listing as it does in the hand. A stamp says its word, which is why
            it survives greyscale where the old tinted pill did not (1.4.1). */}
        <Stamp tone={event.comingSoon ? "faded" : "ink"}>
          {event.comingSoon ? "Coming soon" : "Open"}
        </Stamp>
      </div>

      <h2 className="font-heading text-[length:var(--display-4)] leading-[1.02] tracking-[-0.02em]">
        {title}
      </h2>

      {event.metaLine && (
        <p className="text-[13px] font-medium tracking-[0.04em] text-muted-foreground uppercase tabular-nums">
          {event.metaLine}
        </p>
      )}

      {!event.comingSoon && (
        // No hover transform on the band or the arrow. Both were decoration
        // that moved on a pointer the phone does not have, and between them
        // they spent two durations (500ms, 300ms) that appear nowhere in the
        // motion table.
        <span className="mt-2 inline-flex items-center gap-1.5 self-start border-b border-[color:var(--paper-ink)] pb-0.5 text-sm font-semibold">
          View event
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      )}
    </div>
  );

  if (event.comingSoon) {
    return (
      <div className="cursor-default opacity-70">
        {band}
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label={title}
      /* Same scene change as the featured plate, from the grid. */
      transitionTypes={dissolve()}
      className="paper-focus block outline-none"
    >
      {band}
      {body}
    </Link>
  );
}
