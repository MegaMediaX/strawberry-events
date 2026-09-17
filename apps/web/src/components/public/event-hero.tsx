"use client";

import { Calendar, MapPin } from "lucide-react";
import { CinemaFrame, CinemaTitle } from "./cinema-frame";
import { coverFocus } from "@/lib/events/cover-focus";

/**
 * The feature: the event's own picture, at full width, with its name on it.
 *
 * Two things were resolved here rather than deferred again.
 *
 * **The crop is now a decision.** This file used to promise the full image at
 * its natural aspect, "never cropped", while locking a 16/6 band and applying
 * object-cover — so every cover that was not 2.667:1 had been cut in
 * production all along, a 3:2 poster losing about 44% of its height, and a
 * portrait one losing over seventy per cent. Owning the crop is what the
 * review recommended and what the code already did; what was missing was any
 * way for the person who uploaded the picture to say WHICH part survives.
 * That is `coverFocusX/Y`, chosen in the admin and applied here. Letterboxing
 * instead was the alternative, and it loses the widescreen frame the whole
 * direction rests on.
 *
 * **The hero left the column.** It was an 1024px band with ~208px of cream on
 * either side of a 1440px screen, which is a picture in a document rather than
 * a frame. The title moves onto it, in the serif, at title-card size — the
 * event page's own headline was the most important line in the product and was
 * set in the heavy sans, because Instrument Serif ships weight 400 only and
 * nobody wrote that down.
 *
 * The About, Location and ticket rail below are untouched, and so is the
 * status badge: it already solved the same problem this frame solves, with a
 * near-opaque plate that reads on any artwork.
 *
 * **The entrance fade is gone**, and that is a change of mind about the last
 * stage's own work. It was a `motion.div` opening at `opacity: 0`, which was
 * survivable on a band inside a column and is not on the element that is now
 * the page's largest paint: rendered without JavaScript — a static render, a
 * script that has not arrived yet, a blocked bundle — the entire feature was
 * an empty 540px hole with the event's name invisible inside it. Caught by
 * screenshotting the built page rather than by reading it. A fade-up on the
 * biggest thing on the screen is also the decoration the direction's fourth
 * rule rejects, and the cut between pages belongs to the last stage, not to
 * one component's own entrance.
 */
export function EventHero({
  title,
  dateLabel,
  locationLabel,
  statusLabel,
  coverUrl,
  focusX,
  focusY,
}: {
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  statusLabel: string;
  coverUrl?: string | null;
  focusX?: number | null;
  focusY?: number | null;
}) {
  const isOpen = statusLabel === "Open";
  const isSoldOut = statusLabel === "Sold out";

  const badge = (
    <span
      /* The badge sits over an admin-uploaded photo, so its contrast used to be
         whatever the image happened to be — emerald-50 on a 30% emerald wash
         is unreadable over a pale crop. A near-opaque dark plate reads on any
         artwork; the state is carried by a dot and the word, not by the
         plate's tint. */
      className="absolute end-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full"
        style={{
          background: isOpen
            ? "var(--brand-success)"
            : isSoldOut
              ? "#ffffff"
              : "var(--brand-amber)",
        }}
      />
      {statusLabel}
    </span>
  );

  const meta = (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white">
      {dateLabel && (
        <span className="flex items-center gap-1.5">
          <Calendar aria-hidden="true" className="h-4 w-4" />
          {dateLabel}
        </span>
      )}
      {locationLabel && (
        <span className="flex items-center gap-1.5">
          <MapPin aria-hidden="true" className="h-4 w-4" />
          {locationLabel}
        </span>
      )}
    </div>
  );

  return (
    <CinemaFrame coverUrl={coverUrl} focus={coverFocus(focusX, focusY)} priority overlay={badge}>
      <CinemaTitle title={title}>{title}</CinemaTitle>
      {meta}
    </CinemaFrame>
  );
}
