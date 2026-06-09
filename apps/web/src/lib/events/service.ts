import { randomUUID } from "node:crypto";
import type { Organization, EventMapping } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixEvents from "@/lib/pretix/events";
import * as pretixProducts from "@/lib/pretix/products";
import type { EventInput, TicketInput } from "./schema";

/** List events visible to the session (org-scoped; super admin sees all). */
export function listEventsForSession(
  session: SessionContext,
): Promise<EventMapping[]> {
  return prisma.eventMapping.findMany({
    where: scopeWhere(session),
    orderBy: { createdAt: "desc" },
  });
}

/** Load one event by local id, enforcing org access. Returns null if denied. */
export async function getEventForSession(
  session: SessionContext,
  id: string,
): Promise<EventMapping | null> {
  const mapping = await prisma.eventMapping.findUnique({ where: { id } });
  if (!mapping) return null;
  if (!canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    return null;
  }
  return mapping;
}

async function writeAudit(
  session: SessionContext,
  organizationId: string,
  action: string,
  entityType: string,
  entityId: string,
) {
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: session.userId,
      action,
      entityType,
      entityId,
    },
  });
}

/**
 * Create an event in pretix and a scoped local EventMapping. If the local
 * write fails, the just-created pretix event is rolled back (best-effort).
 */
export async function createEvent(
  session: SessionContext,
  org: Organization,
  input: EventInput,
): Promise<EventMapping> {
  const ctx = resolvePretixContext(org);

  await pretixEvents.createEvent(
    ctx.organizerSlug,
    {
      slug: input.slug,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      date_from: input.dateFrom,
      date_to: input.dateTo ?? null,
      live: input.live,
    },
    ctx.token,
  );

  try {
    const mapping = await prisma.eventMapping.create({
      data: {
        organizationId: org.id,
        localEventId: randomUUID(),
        pretixOrganizerSlug: ctx.organizerSlug,
        pretixEventSlug: input.slug,
        titleEn: input.titleEn,
        titleAr: input.titleAr ?? null,
        descriptionEn: input.descriptionEn ?? null,
        descriptionAr: input.descriptionAr ?? null,
        visibility: input.visibility,
        accountMode: input.accountMode,
        approvalMode: input.approvalMode,
        comingSoon: input.comingSoon,
      },
    });
    await writeAudit(session, org.id, "event.created", "event", mapping.id);
    return mapping;
  } catch (err) {
    // Roll back the orphaned pretix event (best-effort).
    try {
      await pretixEvents.deleteEvent(ctx.organizerSlug, input.slug, ctx.token);
    } catch {
      // ignore rollback failures
    }
    throw err;
  }
}

/**
 * Load an event for editing: the local mapping plus its pretix-sourced dates
 * (pretix is the source of truth for date_from/date_to). Returns null if denied.
 */
export async function getEventForEdit(
  session: SessionContext,
  id: string,
): Promise<{ mapping: EventMapping; dateFrom: string | null; dateTo: string | null } | null> {
  const mapping = await getEventForSession(session, id);
  if (!mapping) return null;
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) return null;
  const ctx = resolvePretixContext(org);
  try {
    const ev = await pretixEvents.getEvent(
      ctx.organizerSlug,
      mapping.pretixEventSlug,
      ctx.token,
    );
    return { mapping, dateFrom: ev.dateFrom, dateTo: ev.dateTo };
  } catch {
    // If pretix is unreachable, still allow editing local fields.
    return { mapping, dateFrom: null, dateTo: null };
  }
}

/** List ticket items for an event the session can access. */
export async function listTickets(session: SessionContext, eventId: string) {
  const mapping = await getEventForSession(session, eventId);
  if (!mapping) throw new Error("Event not found or access denied");
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  return pretixProducts.listItems(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token);
}

/** Update an event (pretix PATCH + local mapping) the session can access. */
export async function updateEvent(
  session: SessionContext,
  eventId: string,
  input: EventInput,
): Promise<EventMapping> {
  const mapping = await getEventForSession(session, eventId);
  if (!mapping) throw new Error("Event not found or access denied");
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  await pretixEvents.updateEvent(
    ctx.organizerSlug,
    mapping.pretixEventSlug,
    { titleEn: input.titleEn, titleAr: input.titleAr, date_from: input.dateFrom },
    ctx.token,
  );

  const updated = await prisma.eventMapping.update({
    where: { id: mapping.id },
    data: {
      titleEn: input.titleEn,
      titleAr: input.titleAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      descriptionAr: input.descriptionAr ?? null,
      visibility: input.visibility,
      accountMode: input.accountMode,
      approvalMode: input.approvalMode,
      comingSoon: input.comingSoon,
    },
  });
  await writeAudit(session, org.id, "event.updated", "event", updated.id);
  return updated;
}

/**
 * Create a ticket (pretix item + quota) on an event the session can access.
 * Records the pretix object ids locally and writes an audit entry.
 */
export async function createTicket(
  session: SessionContext,
  eventId: string,
  input: TicketInput,
): Promise<{ itemId: number; quotaId: number }> {
  const mapping = await getEventForSession(session, eventId);
  if (!mapping) {
    throw new Error("Event not found or access denied");
  }
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  const item = await pretixProducts.createItem(
    ctx.organizerSlug,
    mapping.pretixEventSlug,
    {
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      priceCents: input.priceCents,
    },
    ctx.token,
  );

  const quota = await pretixProducts.createQuota(
    ctx.organizerSlug,
    mapping.pretixEventSlug,
    { name: `${input.titleEn} quota`, size: input.quotaSize, items: [item.id] },
    ctx.token,
  );

  await prisma.pretixObjectMapping.create({
    data: {
      eventMappingId: mapping.id,
      objectType: "item",
      localId: randomUUID(),
      pretixId: String(item.id),
    },
  });
  await prisma.pretixObjectMapping.create({
    data: {
      eventMappingId: mapping.id,
      objectType: "quota",
      localId: randomUUID(),
      pretixId: String(quota.id),
    },
  });

  await writeAudit(session, org.id, "ticket.created", "ticket", String(item.id));
  return { itemId: item.id, quotaId: quota.id };
}
