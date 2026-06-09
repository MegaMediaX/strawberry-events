import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { record } from "@/lib/audit/service";

const RETENTION_DAYS = 14;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Archive/restore: super or organizer_admin for the org; never impersonating. */
function assertCanArchive(session: SessionContext, organizationId: string | null) {
  if (session.impersonating) throw new ForbiddenError("Cannot archive while impersonating");
  if (session.isSuperAdmin) return;
  const m = organizationId
    ? session.memberships.find((x) => x.organizationId === organizationId)
    : undefined;
  if (!m) throw new ForbiddenError("Cross-organization access denied");
  if (m.role !== "organizer_admin") throw new ForbiddenError("Requires organizer admin");
}

/** Purge: same as archive but finance is explicitly never allowed (already excluded). */
function assertCanPurge(session: SessionContext, organizationId: string | null) {
  assertCanArchive(session, organizationId);
}

export interface ArchiveInput {
  entityType: string;
  entityId: string;
  targetName?: string;
  organizationId: string;
  eventMappingId?: string | null;
  reason?: string;
  payload: unknown;
}

/**
 * Soft-archive a record (snapshot + 14-day purge window). Never hard-deletes, and
 * never destructively deletes pretix orders — for pretix, prefer cancel/status changes.
 */
export async function archive(session: SessionContext, input: ArchiveInput) {
  assertCanArchive(session, input.organizationId);
  const row = await prisma.archiveQueue.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      targetName: input.targetName ?? null,
      organizationId: input.organizationId,
      eventMappingId: input.eventMappingId ?? null,
      payload: (input.payload ?? {}) as object,
      reason: input.reason ?? null,
      status: "queued",
      requestedByUserId: session.userId,
      purgeAfter: new Date(Date.now() + RETENTION_MS),
    },
  });
  await record({
    organizationId: input.organizationId, actorUserId: session.userId,
    action: "archive.queued", entityType: "archive", entityId: row.id,
  });
  return row;
}

async function load(session: SessionContext, id: string) {
  const row = await prisma.archiveQueue.findUnique({ where: { id } });
  if (!row) throw new ForbiddenError("Archive entry not found");
  return row;
}

/** Restore an archived record before it is purged. */
export async function restore(session: SessionContext, id: string) {
  const row = await load(session, id);
  assertCanArchive(session, row.organizationId);
  if (row.status !== "queued") throw new ForbiddenError("Only queued items can be restored");
  const updated = await prisma.archiveQueue.update({
    where: { id }, data: { status: "restored", restoredAt: new Date() },
  });
  await record({
    organizationId: row.organizationId, actorUserId: session.userId,
    action: "archive.restored", entityType: "archive", entityId: id,
  });
  return updated;
}

/** Cancel a pending purge (keeps the record archived but not scheduled to purge). */
export async function cancelPurge(session: SessionContext, id: string) {
  const row = await load(session, id);
  assertCanArchive(session, row.organizationId);
  const updated = await prisma.archiveQueue.update({
    where: { id }, data: { status: "canceled", canceledAt: new Date() },
  });
  await record({
    organizationId: row.organizationId, actorUserId: session.userId,
    action: "archive.canceled", entityType: "archive", entityId: id,
  });
  return updated;
}

/** Mark a record purged (purges the local snapshot only; never touches pretix). */
export async function markPurged(session: SessionContext, id: string) {
  const row = await load(session, id);
  assertCanPurge(session, row.organizationId);
  const updated = await prisma.archiveQueue.update({
    where: { id }, data: { status: "purged", purgedAt: new Date(), payload: {} },
  });
  await record({
    organizationId: row.organizationId, actorUserId: session.userId,
    action: "archive.purged", entityType: "archive", entityId: id,
  });
  return updated;
}

export async function listQueue(
  session: SessionContext,
  filters: { organizationId?: string; status?: "queued" | "restored" | "purged" | "canceled" } = {},
) {
  const where: Record<string, unknown> = {};
  if (!session.isSuperAdmin) {
    where.organizationId = { in: session.memberships.map((m) => m.organizationId) };
  } else if (filters.organizationId) {
    where.organizationId = filters.organizationId;
  }
  if (filters.status) where.status = filters.status;
  return prisma.archiveQueue.findMany({ where, orderBy: { archivedAt: "desc" }, take: 200 });
}

/**
 * Cleanup: purge local snapshots of queued items past their 14-day window.
 * Never destructively deletes pretix orders. Audits each purge.
 */
export async function cleanup(session: SessionContext, now: Date = new Date()) {
  const where: Record<string, unknown> = { status: "queued", purgeAfter: { lte: now } };
  if (!session.isSuperAdmin) {
    where.organizationId = { in: session.memberships.map((m) => m.organizationId) };
  }
  const due = await prisma.archiveQueue.findMany({ where });
  for (const row of due) {
    await prisma.archiveQueue.update({
      where: { id: row.id }, data: { status: "purged", purgedAt: now, payload: {} },
    });
    await record({
      organizationId: row.organizationId, actorUserId: session.userId,
      action: "archive.purged", entityType: "archive", entityId: row.id,
    });
  }
  return { purged: due.length };
}
