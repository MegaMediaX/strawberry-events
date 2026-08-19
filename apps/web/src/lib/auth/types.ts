import type { MemberRole } from "@prisma/client";

export type { MemberRole };

export interface Membership {
  organizationId: string;
  role: MemberRole;
  assignedEventIds: string[];
  /**
   * Sub-events a `workshop_organiser` may see. Empty for every other role.
   * Narrows WITHIN `assignedEventIds` — never widens it.
   *
   * Optional on the type, always present at runtime: the session loader selects
   * it, and every other role leaves it empty. Requiring it here would only churn
   * the fixtures of thirty unrelated suites without making anything safer, so
   * readers coalesce to [] instead.
   */
  assignedSubEventIds?: string[];
}

/**
 * The resolved authorization context for a request. Derived from the Auth.js
 * session plus the user's organization memberships.
 */
export interface SessionContext {
  userId: string;
  isSuperAdmin: boolean;
  memberships: Membership[];
  /**
   * True when the user is acting via an (future) admin impersonation session.
   * Sensitive actions (e.g. marking orders paid) are blocked while true.
   * Undefined is treated as false.
   */
  impersonating?: boolean;
}
