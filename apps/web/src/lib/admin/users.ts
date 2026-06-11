import type { Prisma, MemberRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";

/** Only super admins and organizer admins may manage users; never while impersonating. */
function assertCanManageUsers(session: SessionContext) {
  if (session.impersonating) throw new ForbiddenError("Cannot manage users while impersonating");
  if (!session.isSuperAdmin && !session.memberships.some((m) => m.role === "organizer_admin")) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
}

/** Orgs the session administers; null = super admin (all orgs). */
function adminOrgIds(session: SessionContext): string[] | null {
  if (session.isSuperAdmin) return null;
  return [...new Set(session.memberships.filter((m) => m.role === "organizer_admin").map((m) => m.organizationId))];
}

export interface UserFilters {
  q?: string;
  role?: string;
  organizationId?: string;
}

export async function listUsers(session: SessionContext, filters: UserFilters = {}) {
  assertCanManageUsers(session);
  const orgs = adminOrgIds(session);
  const clauses: Prisma.UserWhereInput[] = [];
  if (orgs) clauses.push({ memberships: { some: { organizationId: { in: orgs } } } });
  if (filters.organizationId) clauses.push({ memberships: { some: { organizationId: filters.organizationId } } });
  if (filters.role) clauses.push({ memberships: { some: { role: filters.role as MemberRole } } });
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    clauses.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] });
  }
  const where: Prisma.UserWhereInput = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { AND: clauses };
  return prisma.user.findMany({
    where,
    include: { memberships: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getUserDetail(session: SessionContext, id: string) {
  assertCanManageUsers(session);
  const user = await prisma.user.findUnique({ where: { id }, include: { memberships: true } });
  if (!user) throw new ForbiddenError("User not found");
  const orgs = adminOrgIds(session);
  if (orgs) {
    const shares = user.memberships.some((m) => orgs.includes(m.organizationId));
    if (!shares) throw new ForbiddenError("Access denied");
  }
  return user;
}

async function audit(session: SessionContext, organizationId: string | null, action: string, userId: string) {
  await prisma.auditLog.create({
    data: { organizationId, actorUserId: session.userId, action, entityType: "user", entityId: userId },
  });
}

/**
 * Suspend / reactivate a user. Organizer admins may only act on users who share
 * one of their orgs and may NOT manage super admins. All changes are audited.
 */
export async function setUserStatus(session: SessionContext, userId: string, status: UserStatus) {
  assertCanManageUsers(session);
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { memberships: true } });
  if (!target) throw new ForbiddenError("User not found");

  if (!session.isSuperAdmin) {
    const orgs = adminOrgIds(session) ?? [];
    const shares = target.memberships.some((m) => orgs.includes(m.organizationId));
    if (!shares) throw new ForbiddenError("Access denied");
    if (target.memberships.some((m) => m.role === "super_admin")) {
      throw new ForbiddenError("Cannot manage a super admin");
    }
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { status } });
  await audit(session, target.memberships[0]?.organizationId ?? null, status === "suspended" ? "user.suspended" : "user.reactivated", userId);
  return updated;
}

/**
 * Set a user's role within an organization. Organizer admins may only act in
 * orgs they administer and may NEVER grant super_admin. Audited.
 */
export async function changeRole(
  session: SessionContext,
  userId: string,
  organizationId: string,
  role: MemberRole,
  assignedEventIds: string[] = [],
) {
  assertCanManageUsers(session);
  if (role === "super_admin" && !session.isSuperAdmin) {
    throw new ForbiddenError("Only a super admin can grant super admin");
  }
  const orgs = adminOrgIds(session);
  if (orgs && !orgs.includes(organizationId)) {
    throw new ForbiddenError("Cannot manage users in this organization");
  }

  const membership = await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { role, assignedEventIds },
    create: { organizationId, userId, role, assignedEventIds },
  });
  await audit(session, organizationId, "user.role_changed", userId);
  return membership;
}
