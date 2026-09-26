import type { CSSProperties } from "react";

/**
 * An organiser's poster, shown WHOLE, in a printed frame.
 *
 * Shared by the index's featured plate and the event page's header, which is
 * where the house rule lives now: the poster is never cropped and nothing is
 * set on top of it. Posters carry their own headline, dates and venue, so the
 * old composition — the site's title laid over the artwork behind a scrim —
 * put every fact on screen twice, the two headlines colliding. The site's
 * title goes BELOW, on the page.
 *
 * What this component holds, so neither caller can get it wrong:
 *  - No crop: object-contain in a box of the poster's own shape, so it shows
 *    edge to edge; a cover of unknown size is letterboxed, never cut.
 *  - Space reserved before the image arrives, via the box's aspect-ratio.
 *    NOT width/height attributes alone: `width: auto` overrides those, so the
 *    box had no size until the pixels landed — measured at a layout-shift
 *    score of 0.19 to 0.44 before this was right.
 *  - A height budget that leaves the title and action on screen.
 *  - Flush left, like the text beneath it and the column around it.
 */

/**
 * The tallest a poster may be: what the viewport has left once the header and
 * a title block are paid for (25rem, measured at 1440x900 on the index, which
 * has the most above and below it), never over 72vh, never under 15rem.
 */
export const POSTER_MAX_H = "max(15rem, min(72vh, 100svh - 25rem))";

/** Exact shape, fitting both the column and the height budget. */
export function posterBox(w: number, h: number): CSSProperties {
  return {
    aspectRatio: `${w} / ${h}`,
    width: `min(100%, calc(${POSTER_MAX_H} * ${+(w / h).toFixed(4)}))`,
  };
}

/**
 * The display step a title of this length gets.
 *
 * Measured in Chromium at 1280px: a 78-character event name ran to five 88px
 * lines at display-1. Stepping down by length keeps it a readable block.
 * Character counts because that is what a server can know; house tokens rather
 * than a computed size.
 */
export function titleStep(title: string): 1 | 2 | 3 {
  return title.length <= 28 ? 1 : title.length <= 52 ? 2 : 3;
}

export function Poster({
  coverUrl,
  width,
  height,
  priority = false,
}: {
  coverUrl?: string | null;
  /** Recorded at upload. Null for covers from before sizes were recorded. */
  width?: number | null;
  height?: number | null;
  /** The page's LCP element: eager, high priority. */
  priority?: boolean;
}) {
  const sized = Boolean(width && height);
  const box = sized ? posterBox(width!, height!) : posterBox(16, 9);

  if (!coverUrl) {
    return (
      <div
        className="paper-edge"
        style={{ ...box, backgroundImage: "var(--gradient-hero-strong)" }}
      />
    );
  }

  return (
    <div className="paper-edge overflow-hidden bg-muted" style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        // The title is right below; describing the poster again is noise.
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        width={sized ? width! : undefined}
        height={sized ? height! : undefined}
        className="block h-full w-full object-contain"
      />
    </div>
  );
}
