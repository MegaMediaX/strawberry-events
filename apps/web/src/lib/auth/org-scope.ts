import type { SessionContext, MemberRole } from "./types";

/**
 * Build a Prisma `where` fragment that constrains org-scoped queries to the
 * organizations the session belongs to. Super admins are unconstrained.
 *
 * Always pass the result into queries against org-scoped tables — never query
 * such tables without it.
 */
export function scopeWhere<T extends Record<string, unknown>>(
  session: SessionContext,
  base: T = {} as T,
): T & { organizationId?: { in: string[] } } {
  if (session.isSuperAdmin) {
    return { ...base };
  }
  const orgIds = [...new Set(session.memberships.map((m) => m.organizationId))];
  return { ...base, organizationId: { in: orgIds } };
}

/** Roles a user holds within a given organization. */
function rolesInOrg(session: SessionContext, organizationId: string): MemberRole[] {
  return session.memberships
    .filter((m) => m.organizationId === organizationId)
    .map((m) => m.role);
}

/**
 * Whether the session may operate on a specific event.
 * - super admin: any event
 * - organizer_admin / finance: any event in their org
 * - checkin_staff: only events in `assignedEventIds`
 */
export function canAccessEvent(
  session: SessionContext,
  organizationId: string,
  eventId: string,
): boolean {
  if (session.isSuperAdmin) return true;

  const memberships = session.memberships.filter(
    (m) => m.organizationId === organizationId,
  );
  if (memberships.length === 0) return false;

  return memberships.some((m) => {
    if (m.role === "checkin_staff") {
      return m.assignedEventIds.includes(eventId);
    }
    // organizer_admin and finance have org-wide event access.
    return true;
  });
}

export { rolesInOrg };
