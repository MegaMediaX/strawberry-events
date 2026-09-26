"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { dissolve } from "@/lib/motion";
import { titleStep } from "./cinema-frame";
import type { EventCardData } from "./event-card";

/**
 * The index's opening shot: the featured event's poster, whole, with the
 * site's title set BELOW it.
 *
 * It used to lay the title over the artwork behind a scrim. But these covers
 * are organisers' posters, and a poster already carries its own headline,
 * dates and venue — so every fact appeared twice, in two typefaces, the site's
 * serif sitting across the poster's own lettering. On a phone the crop left
 * fragments of that lettering floating behind the button like debris. The
 * scrim made the site's type LEGIBLE (measured at 8.8:1 and up); the problem
 * was never contrast, it was two headlines in one place.
 *
 * `event-card.tsx` reached the same conclusion for the grid long ago. This is
 * that decision applied to the one surface every visitor actually sees first.
 *
 * Three rules follow from "show the poster whole":
 *  1. No crop. The image keeps its own proportions — no object-fit: cover, no
 *     focal point. The 16/6 frame this replaces discarded a third of a 16/9
 *     poster on desktop, top and bottom, exactly where a poster keeps its
 *     kicker and its footer.
 *  2. Space reserved BEFORE the image arrives, by giving the box an explicit
 *     aspect-ratio and width. Width/height attributes on the <img> were not
 *     enough: `width: auto` overrides them, so the box had no size until the
 *     pixels landed and the page jumped — measured at a layout-shift score of
 *     0.19 to 0.44, where the old frame scored 0. Covers uploaded before sizes
 *     were recorded get a 16/9 box with the poster CONTAINED in it: letterboxed
 *     if it is another shape, but never cropped and never shifting.
 *  3. The action stays on screen. Setting the title below the poster pushed
 *     the button to 918px on a 1440x900 laptop — below the fold. So the poster
 *     is sized to leave room for the title block (POSTER_MAX_H), scaling down
 *     whole rather than being cut, with a floor so a short screen still shows
 *     a poster rather than a sliver.
 */

/**
 * The tallest the poster may be: what the viewport has left once the header
 * and the title block below it are paid for (25rem, measured: nav + index
 * heading above, title + meta + button below), never above 72vh, never under
 * 15rem. The width follows from this and the poster's own ratio.
 */
const POSTER_MAX_H = "max(15rem, min(72vh, 100svh - 25rem))";

/** Box style for a poster of ratio w/h: exact shape, fits the column and the height budget. */
function posterBox(w: number, h: number): React.CSSProperties {
  return {
    aspectRatio: `${w} / ${h}`,
    width: `min(100%, calc(${POSTER_MAX_H} * ${+(w / h).toFixed(4)}))`,
  };
}
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
  const sized = Boolean(event.coverWidth && event.coverHeight);

  return (
    /* The index is the trailer and the event page is the feature: this is the
       one link in the flow that is a scene change rather than a step, so it is
       the one that dissolves. See lib/motion.ts. */
    <Link
      href={href}
      aria-label={title}
      transitionTypes={dissolve()}
      className="paper-focus group mx-auto block max-w-5xl px-4 outline-none sm:px-6"
    >
      {event.coverUrl ? (
        // The poster, framed by the printed rule, in a box of its exact shape
        // so the space is held before a single pixel arrives. Flush LEFT, not
        // centred: the title, dates and button below start at the column edge,
        // as do the index heading above and the grid, so a centred poster left
        // the text hanging ~60px outside it on desktop.
        <div
          className="paper-edge overflow-hidden bg-muted"
          style={sized ? posterBox(event.coverWidth!, event.coverHeight!) : posterBox(16, 9)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.coverUrl}
            // The title is right below; describing the poster again is noise.
            alt=""
            // The index's LCP element.
            loading="eager"
            fetchPriority="high"
            decoding="async"
            width={sized ? event.coverWidth! : undefined}
            height={sized ? event.coverHeight! : undefined}
            // contain, never cover: an exact-shape box shows the poster edge to
            // edge anyway, and a legacy cover of another shape is letterboxed
            // on the matte rather than cut.
            className="block h-full w-full object-contain"
          />
        </div>
      ) : (
        <div
          className="paper-edge"
          style={{ ...posterBox(16, 9), backgroundImage: "var(--gradient-hero-strong)" }}
        />
      )}

      <div className="mt-6 flex flex-col gap-3 sm:mt-8">
        <h1
          className="font-heading max-w-4xl leading-[0.98] tracking-[-0.02em] text-balance"
          style={{ fontSize: `var(--display-${titleStep(title)})` }}
        >
          {title}
        </h1>

        {event.metaLine && (
          <p className="text-[13px] font-medium tracking-[0.04em] text-muted-foreground uppercase tabular-nums">
            {event.metaLine}
          </p>
        )}

        {/* The one red on the screen, and it is the action. A span, not a
            button: the whole plate is the link, and an anchor inside an
            anchor is not markup. */}
        <span className="paper-press mt-2 h-12 self-start bg-primary px-6 text-sm text-primary-foreground group-hover:bg-primary/85">
          View event and register
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
