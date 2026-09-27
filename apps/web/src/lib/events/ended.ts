/**
 * Whether an event is over, so the storefront stops selling it.
 *
 * LEBTECH 2026 ended on 30 Aug and a month later the index still said "What's
 * on", featured it, and the event page still offered "Register now" — anyone
 * who followed it registered for something that had already happened.
 *
 * Times are stored as venue wall-clock (see format.ts), so comparing them with
 * the real `now` is off by the venue's UTC offset: an event in Beirut reads as
 * ended about three hours late. That errs towards still selling during the
 * event's last evening, never towards closing one early, so it is left as is.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function hasEnded(
  dateFrom: string | Date | null | undefined,
  dateTo: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  // An event with no end date runs to the end of its start day, not to the
  // moment it starts: a one-day event must stay open while it is on.
  const end = dateTo
    ? new Date(dateTo)
    : dateFrom
      ? new Date(new Date(dateFrom).getTime() + ONE_DAY_MS)
      : null;
  if (!end || Number.isNaN(end.getTime())) return false;
  return now.getTime() > end.getTime();
}
