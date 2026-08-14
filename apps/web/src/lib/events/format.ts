/**
 * Presentation helpers for event dates and locations.
 *
 * Every formatter pins UTC. Sub-event times are stored as wall-clock instants
 * for the venue and the app runs with timeZone "UTC" in the locale layout;
 * without an explicit timeZone the server formats in its own zone (Beirut, +3)
 * while the browser formats in the visitor's, which both shows the wrong dates
 * and produces a hydration mismatch.
 */
const TZ = "UTC";

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: TZ });
const monthYearFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: TZ,
});

/**
 * "28—30 Aug 2026" for a range inside one month, "28 Aug — 2 Sep 2026" across
 * months, "28 Aug 2026" for a single day. Returns null when there is no date.
 */
export function formatDateRange(
  from: string | Date | null,
  to: string | Date | null,
): string | null {
  if (!from) return null;
  const a = new Date(from);
  const b = to ? new Date(to) : null;

  const sameMonth =
    b && a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();

  if (b && sameMonth && dayFmt.format(a) !== dayFmt.format(b)) {
    return `${dayFmt.format(a)}—${dayFmt.format(b)} ${monthYearFmt.format(a)}`;
  }
  if (b && !sameMonth) {
    return `${dayFmt.format(a)} ${monthYearFmt.format(a)} — ${dayFmt.format(b)} ${monthYearFmt.format(b)}`;
  }
  return `${dayFmt.format(a)} ${monthYearFmt.format(a)}`;
}

/**
 * "28—30 Aug 2026 · Le Royal Hotel Beirut". Either half is dropped when its
 * data is missing, so an event with no venue or no dates still reads cleanly.
 */
export function eventMetaLine(
  from: string | Date | null,
  to: string | Date | null,
  venue: string | null,
): string | null {
  const parts: string[] = [];
  const dates = formatDateRange(from, to);
  if (dates) parts.push(dates);
  if (venue) parts.push(venue);
  return parts.length > 0 ? parts.join(" · ") : null;
}
