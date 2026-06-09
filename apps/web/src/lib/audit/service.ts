import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";

export interface AuditRecordInput {
  organizationId?: string | null;
  eventMappingId?: string | null;
  actorUserId?: string | null;
  impersonatedUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  success?: boolean;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Central audit writer. Never throws into the caller path. */
export async function record(input: AuditRecordInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        eventMappingId: input.eventMappingId ?? null,
        actorUserId: input.actorUserId ?? null,
        impersonatedUserId: input.impersonatedUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        success: input.success ?? true,
        before: (input.before ?? undefined) as object | undefined,
        after: (input.after ?? undefined) as object | undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch {
    // auditing must not break the primary action
  }
}

export interface AuditFilters {
  organizationId?: string;
  eventMappingId?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  success?: boolean;
  impersonationOnly?: boolean;
  from?: Date;
  to?: Date;
  take?: number;
}

function orgIds(session: SessionContext): string[] {
  return session.memberships.map((m) => m.organizationId);
}

/** Query audit logs, isolated to the session's organizations (super sees all). */
export async function query(session: SessionContext, filters: AuditFilters = {}) {
  const where: Record<string, unknown> = {};

  if (session.isSuperAdmin) {
    if (filters.organizationId) where.organizationId = filters.organizationId;
  } else {
    const ids = orgIds(session);
    where.organizationId =
      filters.organizationId && ids.includes(filters.organizationId)
        ? filters.organizationId
        : { in: ids };
  }
  if (filters.eventMappingId) where.eventMappingId = filters.eventMappingId;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.success !== undefined) where.success = filters.success;
  if (filters.impersonationOnly) where.impersonatedUserId = { not: null };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return prisma.auditLog.findMany({
    where,
    include: { actor: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 100,
  });
}

/** Get one audit entry, isolated to the session's organizations. */
export async function getEntry(session: SessionContext, id: string) {
  const entry = await prisma.auditLog.findUnique({
    where: { id },
    include: { actor: { select: { id: true, email: true, name: true } } },
  });
  if (!entry) return null;
  if (!session.isSuperAdmin && (!entry.organizationId || !orgIds(session).includes(entry.organizationId))) {
    return null;
  }
  return entry;
}
