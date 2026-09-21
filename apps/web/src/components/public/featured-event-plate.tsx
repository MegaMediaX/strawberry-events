"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { dissolve } from "@/lib/motion";
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
    /* The index is the trailer and the event page is the feature: this is the
       one link in the flow that is a scene change rather than a step, so it is
       the one that dissolves. See lib/motion.ts — an untagged link is a cut,
       which is how the registration form is excluded without anyone having to
       remember to exclude it. */
    <Link
      href={href}
      aria-label={title}
      transitionTypes={dissolve()}
      className="group block outline-none"
    >
      <CinemaFrame coverUrl={event.coverUrl} focus={coverFocus(event.focusX, event.focusY)} priority>
        <CinemaTitle title={title}>{title}</CinemaTitle>

        {event.metaLine && (
          <p className="text-[13px] font-medium tracking-[0.04em] text-white uppercase tabular-nums">
            {event.metaLine}
          </p>
        )}

        {/* The one red on the screen. A span, not a button: the whole plate is
            the link, and an anchor inside an anchor is not markup. */}
        {/* Square, like every action in the paper layer. The radius was the
            last thing on the opening shot still speaking the card grammar. */}
        <span className="paper-press mt-2 h-12 self-start bg-primary px-6 text-sm text-primary-foreground group-hover:bg-primary/85">
          View event and register
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </CinemaFrame>
    </Link>
  );
}
