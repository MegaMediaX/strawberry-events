"use client";

import { focusPosition, type CoverFocus } from "@/lib/events/cover-focus";

/**
 * The house frame: an admin-uploaded cover, full-bleed, with a title card
 * standing on it.
 *
 * Extracted because there are two of these — the index's opening shot and the
 * event page's hero — and they are not two designs. They are one composition
 * shown twice, and the part they share is the part that is dangerous: the
 * ground under the type is an unknown photograph, so legibility is carried
 * entirely by a scrim whose geometry has to be exactly right. Two copies of
 * that contract is one copy that quietly drifts below the floor on whichever
 * surface nobody screenshotted.
 *
 * Five rules this component exists to hold, in one place:
 *
 *  1. **The scrim rides on the TEXT BLOCK, never on the frame.** Blanketing
 *     the whole picture guarantees the same legibility and deletes the
 *     artwork: shot against a pale poster, a frame-wide floor left a grey
 *     rectangle with a headline on it. On the block it travels with the type.
 *  2. **The block's top padding is `--scrim-fade`**, the exact length over
 *     which the scrim fades out, so the type begins where the scrim has
 *     already reached its floor. One token spends both.
 *  3. **Nothing translucent on the type.** White at 85% over the worst-case
 *     scrimmed pixel is 3.95:1. Solid white only.
 *  4. **`grid-cols-1`, not a bare grid.** The ratio spacer contributes a width
 *     DERIVED FROM ITS HEIGHT: in an auto column that made the cell 640px wide
 *     inside a 390px phone and the headline's second half was clipped away
 *     behind `overflow-hidden` — no scrollbar, no warning. Found by
 *     screenshot; no markup assertion can see it.
 *  5. **Content aligns to the page column.** Full-bleed is the IMAGE, not the
 *     text.
 */
export function CinemaFrame({
  coverUrl,
  focus,
  alt = "",
  priority = false,
  overlay,
  children,
}: {
  coverUrl?: string | null;
  /** Which part of the cover survives the crop. See lib/events/cover-focus. */
  focus: CoverFocus;
  /**
   * Almost always "": the title is in the DOM right below, so describing the
   * picture again is noise to a screen reader. Passed only where the cover is
   * the sole thing carrying meaning.
   */
  alt?: string;
  /** The page's LCP element — eager and high priority rather than lazy. */
  priority?: boolean;
  /** Pinned to the frame's own corner, above the picture: a status badge. */
  overlay?: React.ReactNode;
  /** The title card. Rendered inside the scrimmed block, in the page column. */
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate grid w-full grid-cols-1 overflow-hidden bg-muted text-white">
      {/* Height setter. Same grid cell as the content, so the frame is
          max(house ratio, whatever the title needs) — a locked height would
          crop the headline instead of the picture. */}
      <div
        aria-hidden="true"
        className="col-start-1 row-start-1 aspect-[var(--aspect-cinema)] min-h-60 w-full"
      />

      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: focusPosition(focus), filter: "saturate(0.9) contrast(1.03)" }}
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

      {overlay}

      {/* The focus indicator, for when the whole frame is a link.
          It lives INSIDE the frame because the frame's own background and
          image paint over anything the wrapping anchor draws, and it is
          two-tone because the frame's top edge is unscrimmed picture and may
          itself be white — a white band against a near-black one always
          leaves one of the two contrasting with whatever is under it, which
          is what 1.4.11 asks of an indicator on unknown ground. Inert when
          the parent is not focusable, as on the event hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden shadow-[inset_0_0_0_4px_#ffffff,inset_0_0_0_8px_#111111] group-focus-visible:block"
      />

      {/* Rule 1 and rule 2, in two class names. */}
      <div
        className="relative col-start-1 row-start-1 flex w-full flex-col self-end pt-[var(--scrim-fade)]"
        style={{ backgroundImage: "var(--scrim-cinema)" }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pb-8 sm:px-6 sm:pb-12">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The display step a title of this length gets.
 *
 * A fixed size is a heading, not a shot: measured in Chromium at 1280px, a
 * 78-character event name ran to five 88px lines at display-1 and took the
 * frame to 1.94:1 — a wall of type rather than a widescreen plate. Stepping
 * down put it back to two lines at 2.67:1. Character counts because that is
 * what a server can know, and house tokens rather than a computed size.
 */
export function titleStep(title: string): 1 | 2 | 3 {
  return title.length <= 28 ? 1 : title.length <= 52 ? 2 : 3;
}

/** The title card itself, at the step its own length earns. */
export function CinemaTitle({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <h1
      className="font-heading max-w-4xl leading-[0.98] tracking-[-0.02em] text-balance text-white"
      style={{ fontSize: `var(--display-${titleStep(title)})` }}
    >
      {children}
    </h1>
  );
}
