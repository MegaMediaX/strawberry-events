export interface TimeRange {
  dateFrom: string | Date;
  dateTo: string | Date;
}

function toMs(d: string | Date): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * Two ranges overlap iff a.start < b.end AND b.start < a.end.
 * Touching edges (a.end === b.start) do NOT overlap.
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aFrom = toMs(a.dateFrom);
  const aTo = toMs(a.dateTo);
  const bFrom = toMs(b.dateFrom);
  const bTo = toMs(b.dateTo);
  return aFrom < bTo && bFrom < aTo;
}

/** Return items in `selected` that conflict with `candidate`. */
export function findConflicts<T extends TimeRange>(candidate: T, selected: T[]): T[] {
  return selected.filter((s) => rangesOverlap(candidate, s));
}

// ---------------------------------------------------------------------------
// Server-side registration selection validation (pure, prisma-free)
// ---------------------------------------------------------------------------

export interface SelectionEventCaps {
  ticketsPerUserMain: number;
  ticketsPerUserTotal: number;
}

export interface SelectionSubEvent extends TimeRange {
  id: string;
  titleEn: string;
  /**
   * Conflict detection is scoped to this. An all-day container pass ("Day One",
   * 09:30-18:30) sits in its own category and must not block the workshops that
   * run inside it — booking a day pass AND a session within it is intended.
   */
  category: string;
  pretixItemId: number | null;
  ticketsPerUser: number;
}

export interface TicketSelection {
  itemId: number;
  quantity: number;
}

/**
 * Validate a ticket selection against sub-event caps and time conflicts.
 * Throws a plain Error with a human-readable message on the first violation.
 */
export function validateSelection(
  event: SelectionEventCaps,
  subEvents: SelectionSubEvent[],
  tickets: TicketSelection[],
): void {
  const subEventByItemId = new Map(
    subEvents
      .filter((se) => se.pretixItemId !== null)
      .map((se) => [se.pretixItemId as number, se]),
  );

  const selectedSubEvents: SelectionSubEvent[] = [];
  let mainTotal = 0;
  let overallTotal = 0;

  for (const t of tickets) {
    overallTotal += t.quantity;
    const se = subEventByItemId.get(t.itemId);
    if (se) {
      if (t.quantity > se.ticketsPerUser) {
        throw new Error(
          `Cannot select more than ${se.ticketsPerUser} ticket(s) for "${se.titleEn}"`,
        );
      }
      // Check for conflicts with *different* sub-events only (same sub-event
      // at quantity > 1 is caught by the ticketsPerUser cap above), and only
      // within the SAME category — a day-container pass spans the whole day by
      // design and must not block sessions running inside it.
      const othersSelected = selectedSubEvents.filter(
        (s) => s.id !== se.id && s.category === se.category,
      );
      if (othersSelected.length > 0) {
        const conflicts = findConflicts(se, othersSelected);
        if (conflicts.length > 0) {
          throw new Error(
            `Time conflict: "${se.titleEn}" overlaps "${conflicts[0].titleEn}"`,
          );
        }
      }
      for (let i = 0; i < t.quantity; i++) {
        selectedSubEvents.push(se);
      }
    } else {
      mainTotal += t.quantity;
    }
  }

  if (mainTotal > event.ticketsPerUserMain) {
    throw new Error(
      `Cannot select more than ${event.ticketsPerUserMain} main ticket(s)`,
    );
  }

  if (overallTotal > event.ticketsPerUserTotal) {
    throw new Error(
      `Cannot select more than ${event.ticketsPerUserTotal} total ticket(s)`,
    );
  }
}
