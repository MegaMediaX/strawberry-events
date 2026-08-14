import type { SubEventItem, SubEventSelection } from "./sub-event-picker";

/**
 * The event's itinerary, rendered at two densities from one source.
 *
 * `preview`  — read-only, on the early steps. This is the piece that makes the
 *              flow feel like an event rather than a form: the programme is on
 *              screen before the user types anything.
 * `receipt`  — selected entries only, on the confirm step.
 *
 * The interactive density lives in `sub-event-picker.tsx`, which owns the
 * conflict/cap logic.
 *
 * The fill is animated with CSS transitions rather than framer-motion. Motion
 * components here rendered their target styles during SSR and produced a
 * hydration mismatch (React #418), which tore down the whole registration
 * subtree. CSS transitions have no SSR footprint, need no JS, and degrade
 * correctly under prefers-reduced-motion.
 */

export type ProgrammeVariant = "preview" | "receipt";

/**
 * Sub-event times are stored as wall-clock instants for the venue, and the app
 * is configured with timeZone "UTC" in the locale layout. Every formatter here
 * pins UTC explicitly: without it the server formats in its own zone (Beirut,
 * +3) while the browser formats in the visitor's, which both shows the wrong
 * hours and produces a hydration mismatch.
 */
const TZ = "UTC";

/** Day number and month, e.g. "28" / "AUG". */
export function dateStamp(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: TZ }).format(d),
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: TZ })
      .format(d)
      .toUpperCase(),
  };
}

/** "09:30—18:00" with an em dash. */
export function timeRange(from: string, to: string): string {
  const f = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
  return `${f.format(new Date(from))}—${f.format(new Date(to))}`;
}

export function Programme({
  subEvents,
  selected,
  variant,
  className,
}: {
  subEvents: SubEventItem[];
  selected: SubEventSelection[];
  variant: ProgrammeVariant;
  className?: string;
}) {
  const isSelected = (se: SubEventItem) =>
    se.pretixItemId !== null &&
    (selected.find((s) => s.itemId === se.pretixItemId)?.quantity ?? 0) > 0;

  const rows = variant === "receipt" ? subEvents.filter(isSelected) : subEvents;
  if (rows.length === 0) return null;

  return (
    <ul className={className}>
      {rows.map((se) => {
        const on = isSelected(se);
        const { day, month } = dateStamp(se.dateFrom);
        return (
          <li
            key={se.id}
            className="relative grid grid-cols-[44px_1fr] items-baseline gap-3 border-b border-border py-3 last:border-b-0"
          >
            {/* Rows resolve from 45% to full as they are chosen: the schedule
                visibly assembles itself as the user selects. */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 start-0 w-[3px] origin-top rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: on ? "scaleY(1)" : "scaleY(0)" }}
            />
            <span
              className="font-heading text-[22px] leading-none tabular-nums transition-opacity duration-300 ease-out motion-reduce:transition-none"
              style={{ opacity: on ? 1 : 0.45 }}
            >
              {day}
              <span className="ms-1 font-sans text-[10px] font-semibold tracking-[0.1em] text-muted-foreground">
                {month}
              </span>
            </span>
            <span
              className="min-w-0 transition-opacity duration-300 ease-out motion-reduce:transition-none"
              style={{ opacity: on ? 1 : 0.45 }}
            >
              <span className="block truncate text-sm font-medium">{se.titleEn}</span>
              <span className="block text-[12px] tracking-[0.04em] text-muted-foreground tabular-nums">
                {timeRange(se.dateFrom, se.dateTo)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
