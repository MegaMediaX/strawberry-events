import type { SessionContext, MemberRole } from "./types";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Pure check: does the session hold any of the required roles? */
export function hasAnyRole(
  session: SessionContext,
  roles: MemberRole[],
): boolean {
  if (session.isSuperAdmin) return true;
  const held = new Set(session.memberships.map((m) => m.role));
  return roles.some((r) => held.has(r));
}

/** Throws ForbiddenError when the session lacks all required roles. */
export function assertRole(
  session: SessionContext,
  roles: MemberRole[],
): void {
  if (!hasAnyRole(session, roles)) {
    throw new ForbiddenError(
      `Requires one of: ${roles.join(", ")}`,
    );
  }
}
