import { Calendar, MapPin } from "lucide-react";
import { Stamp } from "@/components/paper/stamp";
import { Poster, titleStep } from "./poster";

/**
 * The event page's header: the organiser's poster, whole, then the event's
 * name, status, date and venue set on the page below it.
 *
 * It used to be a full-bleed 16/6 frame with the name laid over the cover
 * behind a scrim. Same decision as the index's featured plate, same reason:
 * posters carry their own headline, dates and venue, so the overlay put every
 * fact on screen twice with the two headlines colliding, and the 16/6 crop cut
 * a third off a 16/9 poster — more off a portrait one. The rules for showing a
 * poster whole now live in one place, `poster.tsx`, shared by both surfaces.
 *
 * The status was a near-opaque dark badge, because it sat on an unknown
 * photograph and had to read on any artwork. On the page it needs no plate: it
 * is the same stamp the listing uses, so a state reads the same everywhere,
 * and it says its word rather than relying on a coloured dot.
 *
 * Still painted by the server with no entrance animation: this is the page's
 * largest element, and an opacity-0 entrance left it an empty hole whenever
 * the script was late or blocked.
 */
export function EventHero({
  title,
  dateLabel,
  locationLabel,
  statusLabel,
  coverUrl,
  coverWidth,
  coverHeight,
}: {
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  statusLabel: string;
  coverUrl?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">
      <Poster coverUrl={coverUrl} width={coverWidth} height={coverHeight} priority />

      <div className="mt-6 flex flex-col gap-3 sm:mt-8">
        <div>
          <Stamp tone={statusLabel === "Open" ? "ink" : "faded"}>{statusLabel}</Stamp>
        </div>

        <h1
          className="font-heading max-w-4xl leading-[0.98] tracking-[-0.02em] text-balance"
          style={{ fontSize: `var(--display-${titleStep(title)})` }}
        >
          {title}
        </h1>

        {(dateLabel || locationLabel) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
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
        )}
      </div>
    </div>
  );
}
