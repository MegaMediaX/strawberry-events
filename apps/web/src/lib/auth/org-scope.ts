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
 * `checkin_staff` is deliberately NOT here: it is itself narrowed per membership
 * by assignedEventIds, so treating it as broad let someone holding it in one
 * organization see everything in another where they were only a workshop
 * organiser.
 */
const BROAD_ROLES: MemberRole[] = ["super_admin", "organizer_admin", "finance"];

/**
 * Which sub-events this session is limited to, or `null` for no limit.
 *
 * `null` means "not sub-event restricted". An ARRAY means the session may only
 * see registrations booked into those sessions; an EMPTY array means it may see
 * nothing. Callers must branch on `=== null` — treating `[]` as falsy inverts
 * "may see nothing" into "may see everything".
 *
 * The restriction is lifted only when a broad role is held in EVERY organization
 * where this user is also a workshop organiser. Checking "holds a broad role
 * anywhere" was wrong and exploitable: finance in one organization silently
 * unlocked the full attendee roster of an unrelated organization where the user
 * was only a workshop organiser. Roles are per-organization everywhere else in
 * this file, and this is no exception.
 *
 * When a user is broad in one org and narrow in another, this collapses to the
 * NARROW answer, because the return type is one flat list and cannot say
 * "unrestricted here, restricted there". That is deliberately the conservative
 * direction: it under-shows to an admin rather than over-showing to an
 * organiser. Give such a user separate accounts if the admin view is needed.
 */
export function subEventScope(session: SessionContext): string[] | null {
  if (session.isSuperAdmin) return null;

  const workshops = session.memberships.filter((m) => m.role === "workshop_organiser");
  if (workshops.length === 0) return null;

  const broadOrgs = new Set(
    session.memberships.filter((m) => BROAD_ROLES.includes(m.role)).map((m) => m.organizationId),
  );
  // Broad in every org where they run a workshop: nothing to narrow.
  if (workshops.every((m) => broadOrgs.has(m.organizationId))) return null;

  return [...new Set(workshops.flatMap((m) => m.assignedSubEventIds ?? []))];
}

/** Whether this session may see registrations for one specific sub-event. */
export function canAccessSubEvent(session: SessionContext, subEventId: string): boolean {
  const scope = subEventScope(session);
  return scope === null || scope.includes(subEventId);
}
