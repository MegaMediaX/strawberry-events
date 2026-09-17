"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
 * Three rules this component may not break:
 *
 *  1. Nothing translucent on the type. Every ground under it is an unknown
 *     upload, so contrast is carried entirely by the scrim; white at 85% over
 *     the worst-case scrimmed pixel is 3.95:1 and fails. Solid white only.
 *     And the scrim belongs to the TEXT BLOCK, never to the frame: blanketing
 *     the picture guarantees the same legibility and deletes the artwork —
 *     shot against a pale poster, a frame-wide floor left a grey rectangle.
 *  2. The content aligns to the same max-w-5xl column as the rest of the
 *     page. Full-bleed is the IMAGE, not the text.
 *  3. The frame is at least the house ratio tall and grows for a long title.
 *     A locked height crops the headline instead of the picture.
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

  /**
   * The title card sizes to its title.
   *
   * A fixed display size is a heading, not a shot: measured in Chromium at
   * 1280px, a 78-character event name — "Annual General Assembly of the
   * Lebanese Franchise Association and Awards Night", which is the shape real
   * ones take here — ran to five 88px lines and turned the frame into a wall
   * of type at 1.94:1, no longer widescreen by any reading. Stepping down
   * keeps the frame a frame. The thresholds are character counts because that
   * is what a server can know; the step is one of the house display sizes, not
   * a computed one.
   */
  const displayStep = title.length <= 28 ? 1 : title.length <= 52 ? 2 : 3;

  return (
    <Link
      href={href}
      aria-label={title}
      /* The focus indicator is INSET and two-tone. The house --ring is
         charcoal, invisible against a dark photograph; an outside ring on a
         full-bleed element is clipped at the viewport edge; and a single white
         ring would run along the TOP of the frame, which is unscrimmed picture
         and may be white itself. A white band against a near-black band always
         leaves one of the two contrasting with whatever is under it, which is
         what 1.4.11 asks of an indicator on unknown ground. */
      /* grid-cols-1, not a bare grid. An auto column sizes to its items'
         max-content, and the ratio spacer below contributes width DERIVED FROM
         ITS HEIGHT: at 390px the 15rem floor made it 640px wide, the column
         went with it, and the title ran off the side of the phone behind
         overflow-hidden — no scrollbar, no warning, just a missing second half
         of the headline. grid-cols-1 is repeat(1, minmax(0, 1fr)), whose zero
         minimum lets the cell take the viewport instead. Found by screenshot;
         no markup assertion can see it. */
      className="group relative isolate grid w-full grid-cols-1 overflow-hidden bg-muted text-white outline-none focus-visible:shadow-[inset_0_0_0_4px_#ffffff,inset_0_0_0_8px_#111111]"
    >
      {/* Height setter. Same grid cell as the content below, so the frame is
          max(house ratio, whatever the title needs) — see rule 3 above. */}
      <div
        aria-hidden="true"
        className="col-start-1 row-start-1 aspect-[var(--aspect-cinema)] min-h-60 w-full"
      />

      {event.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverUrl}
          alt=""
          /* The LCP element of the index. */
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ filter: "saturate(0.9) contrast(1.03)" }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "var(--gradient-hero-strong)" }}
        />
      )}

      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundImage: "var(--vignette)" }}
      />

      {/* The scrim rides on this block, and pt is --scrim-fade because the
          gradient's fade-out is exactly that tall: the type begins where the
          scrim has already reached its floor. Changing one without the other
          is how a legible title becomes an illegible one on a pale cover, so
          they read the same token. */}
      <div
        className="relative col-start-1 row-start-1 flex w-full flex-col self-end pt-[var(--scrim-fade)]"
        style={{ backgroundImage: "var(--scrim-cinema)" }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pb-8 sm:px-6 sm:pb-12">
          <h1
            className="font-heading max-w-4xl leading-[0.98] tracking-[-0.02em] text-balance text-white"
            style={{ fontSize: `var(--display-${displayStep})` }}
          >
            {title}
          </h1>

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
        </div>
      </div>
    </Link>
  );
}
