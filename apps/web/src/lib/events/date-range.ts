import { prisma } from "@/lib/db/client";

export interface EventDateRange {
  from: Date | null;
  to: Date | null;
}

/**
 * An event's span, from the sessions stored in our own database.
 *
 * pretix owns the canonical event dates, but the sub-event rows already carry
 * the real schedule — which is how the listing page draws its date ranges —
 * so a ticket can show when the event is without an API call per view.
 *
 * Returns nulls for an event with no sub-events; callers render nothing rather
 * than guessing.
 */
export async function getEventDateRange(eventMappingId: string): Promise<EventDateRange> {
  const [row] = await prisma.subEvent.groupBy({
    by: ["eventMappingId"],
    where: { eventMappingId },
    _min: { dateFrom: true },
    _max: { dateTo: true },
  });
  return { from: row?._min.dateFrom ?? null, to: row?._max.dateTo ?? null };
}
