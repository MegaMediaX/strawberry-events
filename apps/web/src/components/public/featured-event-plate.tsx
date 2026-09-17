"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CinemaFrame, CinemaTitle } from "./cinema-frame";
import { coverFocus } from "@/lib/events/cover-focus";
import type { EventCardData } from "./event-card";

/**
 * The index's opening shot: the featured event as a frame, not a card.
 *
 * The index had no first frame. `(public)/page.tsx` redirects straight here,
 * and the page's own heading is an 11px uppercase rule by design — so the
 * featured event's card was doing the title card's job from inside a 1024px
 * column with ~208px of cream on either side. This is that event given the
 * whole width: one image, one title, one subtitle line, one red action.
 *
 * Only ever used for an OPEN event — `listPublicEvents` splits on
 * `comingSoon`, and the index takes the featured entry from the open list —
 * so there is no status pill here. The action says the status.
 *
 * The frame, the scrim and the title card now live in `cinema-frame.tsx`,
 * shared with the event hero: they are one composition shown twice, and the
 * shared part is the contrast contract, which is the part that must not drift.
 */
export function FeaturedEventPlate({
  event,
  locale,
}: {
  event: EventCardData;
  locale: string;
}) {
  // The Arabic locale is retired (lib/i18n/dir.ts), so this resolves to
  // titleEn today — kept live so the branch works the day it returns.
  const title = locale === "ar" && event.titleAr ? event.titleAr : event.titleEn;
  const href = `/${locale}/events/${event.slug}`;

  return (
    <Link href={href} aria-label={title} className="group block outline-none">
      <CinemaFrame coverUrl={event.coverUrl} focus={coverFocus(event.focusX, event.focusY)} priority>
        <CinemaTitle title={title}>{title}</CinemaTitle>

        {event.metaLine && (
          <p className="text-[13px] font-medium tracking-[0.04em] text-white uppercase tabular-nums">
            {event.metaLine}
          </p>
        )}

        {/* The one red on the screen. A span, not a button: the whole plate is
            the link, and an anchor inside an anchor is not markup. */}
        <span className="mt-2 inline-flex h-12 items-center gap-2 self-start rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/85 motion-reduce:transition-none">
          View event and register
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </CinemaFrame>
    </Link>
  );
}
