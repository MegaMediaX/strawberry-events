/**
 * Pick the right pretix check-in list for the day being worked.
 *
 * A multi-day event has one check-in list per day, because pretix tracks
 * redemption PER LIST — that is the only thing letting the same ticket be
 * scanned again on day two. Selecting the wrong list is therefore not a
 * cosmetic error: every attendee who already came yesterday is refused at the
 * door with "already redeemed".
 *
 * The page previously defaulted to `lists[0]` forever, so from day two onwards
 * staff had to know to hand-edit a `?list=` query param. Nobody remembers that
 * at 8am, and the screen gives no hint it is on the wrong day. Choosing
 * automatically removes the human from the loop entirely — which is also why
 * this is a plain function with no UI attached.
 */

export interface DayLike {
  /** Naive VENUE wall-clock, as stored ("2026-08-28T09:30:00.000Z"). */
  dateFrom: string | Date;
}

export interface ListLike {
  id: number;
}

/** "YYYY-MM-DD" of a stored naive venue timestamp, without going via Date. */
function venueDateKey(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

/**
 * Today's date at the venue, as "YYYY-MM-DD".
 *
 * Compared at DATE level, so the venue's UTC offset only matters around
 * midnight — and check-in never runs at midnight. `en-CA` yields ISO order.
 */
export function venueToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Choose the check-in list matching `today`.
 *
 * Days and lists are paired BY ORDINAL — first day to first list — rather than
 * by parsing names, so renaming a list in pretix cannot silently break the
 * mapping. It does mean the two must stay the same length and order: adding or
 * removing a check-in list mid-event would shift every pairing, which is why
 * that is called out in the door runbook.
 *
 * Outside the event window it clamps to the nearest end: before day one you get
 * day one (setup and rehearsal), after the last day you get the last day (late
 * reconciliation). Returns null only when there is nothing sensible to pick,
 * and the caller then keeps its existing behaviour.
 */
export function selectListIdForDate(
  days: DayLike[],
  lists: ListLike[],
  today: string,
): number | null {
  if (lists.length === 0) return null;
  // One list and nothing to disambiguate: the answer is never in doubt.
  if (lists.length === 1) return lists[0].id;

  const dayKeys = [...days]
    .map((d) => venueDateKey(d.dateFrom))
    .sort()
    .filter((k, i, arr) => arr.indexOf(k) === i);

  // A mismatched count means the ordinal pairing is not trustworthy. Fail back
  // to the caller's default rather than confidently checking people into the
  // wrong day.
  if (dayKeys.length !== lists.length) return null;

  const exact = dayKeys.indexOf(today);
  if (exact !== -1) return lists[exact].id;

  if (today < dayKeys[0]) return lists[0].id;
  if (today > dayKeys[dayKeys.length - 1]) return lists[lists.length - 1].id;

  // A gap between event days (rare, but a break day is legal): use the most
  // recent day that has already started.
  let idx = 0;
  for (let i = 0; i < dayKeys.length; i++) {
    if (dayKeys[i] <= today) idx = i;
  }
  return lists[idx].id;
}
