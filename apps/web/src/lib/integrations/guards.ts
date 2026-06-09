import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";

/** Edit integrations/secrets: super or organizer_admin for the org; not impersonating. */
export function assertCanEditIntegration(session: SessionContext, organizationId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot modify integrations while impersonating");
  }
  if (session.isSuperAdmin) return;
  const m = session.memberships.find((x) => x.organizationId === organizationId);
  if (!m) throw new ForbiddenError("Cross-organization access denied");
  if (m.role !== "organizer_admin") {
    throw new ForbiddenError("Requires organizer admin to edit integrations");
  }
}

/** View integration status: super, organizer_admin, or finance (status only) for the org. */
export function assertCanViewIntegration(session: SessionContext, organizationId: string) {
  if (session.isSuperAdmin) return;
  const m = session.memberships.find((x) => x.organizationId === organizationId);
  if (!m) throw new ForbiddenError("Cross-organization access denied");
  if (!["organizer_admin", "finance"].includes(m.role)) {
    throw new ForbiddenError("Not permitted to view integrations");
  }
}
