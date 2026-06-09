import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";

/** Resolve the organization an admin is acting within (first org membership, or first org for super). */
export async function resolveOrgId(session: SessionContext): Promise<string | null> {
  const m = session.memberships.find((x) => x.role === "organizer_admin" || x.role === "finance");
  if (m) return m.organizationId;
  if (session.isSuperAdmin) {
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    return org?.id ?? null;
  }
  return null;
}
