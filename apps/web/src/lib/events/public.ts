import type { EventMapping } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";

export interface PublicTicket {
  id: number;
  titleEn: string;
  titleAr: string | null;
  priceCents: number;
}

export interface PublicEventDetail {
  event: EventMapping;
  tickets: PublicTicket[];
  capacity: { sold: number; total: number | null };
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
    where: { visibility: "public" },
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
    where: { pretixEventSlug: slug, visibility: "public" },
  });
  if (!event) return null;

  const org = await prisma.organization.findUnique({
    where: { id: event.organizationId },
  });
  if (!org) return null;
  const ctx = resolvePretixContext(org);

  const [items, quotas] = await Promise.all([
    pretixProducts.listItems(ctx.organizerSlug, event.pretixEventSlug, ctx.token),
    pretixProducts.listQuotas(ctx.organizerSlug, event.pretixEventSlug, ctx.token),
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

  return {
    event,
    tickets: items
      .filter((i) => i.active)
      .map((i) => ({
        id: i.id,
        titleEn: i.titleEn,
        titleAr: i.titleAr,
        priceCents: i.priceCents,
      })),
    capacity,
  };
}
