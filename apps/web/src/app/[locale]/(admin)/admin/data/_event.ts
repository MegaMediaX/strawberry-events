import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";

/**
 * Resolve which event a Data page is about.
 *
 * The section is global rather than nested under `/events/[id]`, because half
 * its job is to surface things that belong to NO event as far as our database
 * is concerned. With a single event configured, requiring an id in the URL
 * would be friction for no benefit, so fall through to the only one.
 */
export async function resolveEventId(
  session: SessionContext,
  requested?: string,
): Promise<string | null> {
  if (requested) return requested;
  const orgs = session.isSuperAdmin
    ? undefined
    : { organizationId: { in: session.memberships.map((m) => m.organizationId) } };
  const events = await prisma.eventMapping.findMany({
    where: orgs,
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  return events.length === 1 ? events[0].id : (events[0]?.id ?? null);
}
