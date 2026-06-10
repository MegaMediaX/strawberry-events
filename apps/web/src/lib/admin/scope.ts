import type { Prisma } from "@prisma/client";
import type { SessionContext } from "@/lib/auth/types";

/**
 * EventMapping `where` fragment limiting results to events the session may view.
 * Returns `null` for super admins (unconstrained). For everyone else it ORs each
 * membership's reach: organizer_admin/finance see their whole org; checkin_staff
 * see only their assigned events. A non-super user with no memberships matches
 * nothing (fail closed). This is the single source of truth for admin read scope.
 */
export function eventScope(session: SessionContext): Prisma.EventMappingWhereInput | null {
  if (session.isSuperAdmin) return null;
  const clauses: Prisma.EventMappingWhereInput[] = [];
  for (const m of session.memberships) {
    if (m.role === "checkin_staff") {
      clauses.push({ organizationId: m.organizationId, localEventId: { in: m.assignedEventIds } });
    } else if (m.role === "organizer_admin" || m.role === "finance") {
      clauses.push({ organizationId: m.organizationId });
    }
  }
  if (clauses.length === 0) return { id: "__never__" };
  return { OR: clauses };
}

/** AttendeeOrder `where` fragment scoped to the events the session may view. */
export function orderScope(session: SessionContext): Prisma.AttendeeOrderWhereInput {
  const ev = eventScope(session);
  return ev ? { eventMapping: ev } : {};
}

/** Merge a (possibly null) scope fragment with extra filters via AND. */
export function mergeWhere<T extends object>(scope: T | null | undefined, extra: T): T {
  if (!scope) return extra;
  return { AND: [scope, extra] } as unknown as T;
}
