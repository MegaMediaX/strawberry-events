import type { Prisma, MemberRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { generateResetToken } from "@/lib/tokens/reset-token";
import { sendEmail } from "@/lib/email/service";
import { userInviteEmail, type Locale } from "@/lib/email/templates";

/** Invite links are valid for 7 days (longer than a self-service reset). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Organizations the session may invite users into (super admin → all). */
export async function invitableOrgs(
  session: SessionContext,
): Promise<{ id: string; name: string }[]> {
  assertCanManageUsers(session);
  const orgs = adminOrgIds(session);
  return prisma.organization.findMany({
    where: orgs ? { id: { in: orgs } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Roles the session may grant (org admins cannot mint super admins). */
export function grantableRoles(session: SessionContext): MemberRole[] {
  const base: MemberRole[] = ["organizer_admin", "finance", "checkin_staff"];
  return session.isSuperAdmin ? (["super_admin", ...base] as MemberRole[]) : base;
}

export interface InviteInput {
  email: string;
  name?: string | null;
  organizationId: string;
  role: MemberRole;
}

/**
 * Invite a new staff/admin user: create a role-less account, attach the org
 * membership/role, mint a 7-day single-use token, and email a set-password link
 * (reuses the password-reset flow). Role hierarchy is enforced — an organizer
 * admin can never grant super_admin and can only act in orgs they administer.
 * Audited. Rejects duplicate emails (manage the existing user instead).
 */
export async function inviteUser(
  session: SessionContext,
  input: InviteInput,
  locale: Locale = "en",
): Promise<{ userId: string; emailSent: boolean }> {
  assertCanManageUsers(session);

  if (input.role === "super_admin" && !session.isSuperAdmin) {
    throw new ForbiddenError("Only a super admin can grant super admin");
  }
  const orgs = adminOrgIds(session);
  if (orgs && !orgs.includes(input.organizationId)) {
    throw new ForbiddenError("Cannot invite users into this organization");
  }

  const email = input.email.toLowerCase().trim();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");

  const org = await prisma.organization.findUnique({ where: { id: input.organizationId } });
  if (!org) throw new ForbiddenError("Organization not found");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with that email already exists");

  const user = await prisma.user.create({
    data: { email, name: input.name?.trim() || null, status: "active" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: input.role, assignedEventIds: [] },
  });

  const { token, tokenHash } = generateResetToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  const url = `${process.env.APP_URL ?? ""}/${locale}/reset-password?token=${token}`;
  const emailSent = await sendEmail(
    { to: email, ...userInviteEmail(locale, url, org.name) },
    { templateType: "user_invite", organizationId: org.id, attendeeRef: user.id },
  );

  await audit(session, org.id, "user.invited", user.id);
  // The account + token are created regardless; the caller surfaces a delivery
  // failure so the admin can resend rather than believing the invite arrived.
  return { userId: user.id, emailSent };
}

export async function listUsers(session: SessionContext, filters: UserFilters = {}) {
  assertCanManageUsers(session);
  const orgs = adminOrgIds(session);
  // Defensive: a non-super admin may only filter within orgs they administer,
  // even though the org clause below already constrains results.
  if (orgs && filters.organizationId && !orgs.includes(filters.organizationId)) {
    throw new ForbiddenError("Cannot list users in this organization");
  }
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
  assignedEventIds?: string[],
) {
  assertCanManageUsers(session);
  if (role === "super_admin" && !session.isSuperAdmin) {
    throw new ForbiddenError("Only a super admin can grant super admin");
  }
  const orgs = adminOrgIds(session);
  if (orgs && !orgs.includes(organizationId)) {
    throw new ForbiddenError("Cannot manage users in this organization");
  }

  // Preserve existing event scoping on a role change unless the caller passes a
  // new value — otherwise a checkin_staff member's assignedEventIds would be
  // silently wiped (widening access).
  const membership = await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { role, ...(assignedEventIds !== undefined ? { assignedEventIds } : {}) },
    create: { organizationId, userId, role, assignedEventIds: assignedEventIds ?? [] },
  });
  await audit(session, organizationId, "user.role_changed", userId);
  return membership;
}
