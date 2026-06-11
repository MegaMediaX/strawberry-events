import type { EventMapping } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";
import * as pretixEvents from "@/lib/pretix/events";

export interface PublicTicket {
  id: number;
  titleEn: string;
  titleAr: string | null;
  priceCents: number;
}

export interface PublicEventDetail {
  event: EventMapping;
  tickets: PublicTicket[];
  /** Items hidden from public registration (invite-only). */
  inviteOnlyTickets: PublicTicket[];
  capacity: { sold: number; total: number | null };
  dateFrom: string | null;
  dateTo: string | null;
}

/**
 * Public listing: only published public events, split into open vs coming-soon.
 * Intentionally crosses organizations (the Strawberry storefront).
 */
export async function listPublicEvents(): Promise<{
  open: EventMapping[];
  comingSoon: EventMapping[];
}> {
  const events = await prisma.eventMapping.findMany({
    where: { visibility: "public", liveOnPretix: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    open: events.filter((e) => !e.comingSoon),
    comingSoon: events.filter((e) => e.comingSoon),
  };
}

/** Public event detail: mapping + tickets + aggregated capacity. Null if not public. */
export async function getPublicEvent(
  slug: string,
): Promise<PublicEventDetail | null> {
  const event = await prisma.eventMapping.findFirst({
    where: { pretixEventSlug: slug, visibility: "public", liveOnPretix: true },
  });
  if (!event) return null;

  const org = await prisma.organization.findUnique({
    where: { id: event.organizationId },
  });
  if (!org) return null;
  const ctx = resolvePretixContext(org);

  const [items, quotas, detail, subEvents] = await Promise.all([
    pretixProducts.listItems(ctx.organizerSlug, event.pretixEventSlug, ctx.token),
    pretixProducts.listQuotas(ctx.organizerSlug, event.pretixEventSlug, ctx.token),
    pretixEvents
      .getEvent(ctx.organizerSlug, event.pretixEventSlug, ctx.token)
      .catch(() => null),
    prisma.subEvent.findMany({
      where: { eventMappingId: event.id },
      select: { pretixItemId: true },
    }),
  ]);

  // Aggregate capacity: unlimited if any quota is unlimited (size null).
  let total: number | null = 0;
  let available = 0;
  for (const q of quotas) {
    if (q.size === null) {
      total = null;
      break;
    }
    total += q.size;
    available += q.available_number ?? 0;
  }
  const capacity =
    total === null
      ? { sold: 0, total: null }
      : { sold: Math.max(0, total - available), total };

  const inviteOnlySet = new Set(event.inviteOnlyItemIds);
  // Sub-events are pretix items too, but they belong only in the "Sessions"
  // step of registration — never the main ticket selector. Exclude them here.
  const subEventItemSet = new Set(
    subEvents.map((s) => s.pretixItemId).filter((id): id is number => id != null),
  );
  const activeItems = items.filter((i) => i.active && !subEventItemSet.has(i.id));
  const toTicket = (i: (typeof activeItems)[number]): PublicTicket => ({
    id: i.id,
    titleEn: i.titleEn,
    titleAr: i.titleAr,
    priceCents: i.priceCents,
  });

  return {
    event,
    tickets: activeItems.filter((i) => !inviteOnlySet.has(i.id)).map(toTicket),
    inviteOnlyTickets: activeItems.filter((i) => inviteOnlySet.has(i.id)).map(toTicket),
    capacity,
    dateFrom: detail?.dateFrom ?? null,
    dateTo: detail?.dateTo ?? null,
  };
}
