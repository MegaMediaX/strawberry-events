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
    if (m.role === "checkin_staff" || m.role === "workshop_organiser") {
      // Both are narrowed to named events. For a workshop organiser this is
      // only the outer gate — which sessions they may see is enforced
      // separately by `subEventScope`.
      return m.assignedEventIds.includes(eventId);
    }
    // organizer_admin and finance have org-wide event access.
    return true;
  });
}

export { rolesInOrg };

/**
 * Roles that genuinely see a whole organization.
 *
 * `checkin_staff` is deliberately NOT here despite also being a non-admin role:
 * it is itself narrowed per membership by assignedEventIds, so treating it as
 * broad meant someone holding checkin_staff in one organization got UNRESTRICTED
 * session visibility in another where they were only a workshop organiser — and
 * picked up the admin nav that role has never had.
 */
const BROAD_ROLES: MemberRole[] = ["super_admin", "organizer_admin", "finance"];

/**
 * Which sub-events this session is limited to, or `null` for no limit.
 *
 * `null` means "not sub-event restricted" — a super admin, or anyone holding a
 * role that already sees the whole organization. An ARRAY means the session may
 * only ever see registrations booked into those sessions, and an EMPTY array
 * means it may see nothing at all.
 *
 * The distinction matters: a caller that treats `null` and `[]` alike either
 * locks out an admin or hands a workshop organiser the full list. Callers must
 * branch on `=== null` explicitly.
 */
export function subEventScope(session: SessionContext): string[] | null {
  if (session.isSuperAdmin) return null;
  // Any broad role anywhere lifts the restriction — a person can legitimately be
  // an org admin here and a workshop organiser there, and the broader grant wins.
  if (session.memberships.some((m) => BROAD_ROLES.includes(m.role))) return null;

  const scoped = session.memberships.filter((m) => m.role === "workshop_organiser");
  if (scoped.length === 0) return null;
  return [...new Set(scoped.flatMap((m) => m.assignedSubEventIds ?? []))];
}

/** Whether this session may see registrations for one specific sub-event. */
export function canAccessSubEvent(session: SessionContext, subEventId: string): boolean {
  const scope = subEventScope(session);
  return scope === null || scope.includes(subEventId);
}
