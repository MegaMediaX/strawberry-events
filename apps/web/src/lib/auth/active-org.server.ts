import "server-only";
import { cookies } from "next/headers";
import type { Organization } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { chooseActiveOrgId } from "./active-org";
import type { SessionContext } from "./types";

const COOKIE = "active_org";

/**
 * Resolve the active Organization for the session. Super admins may switch via
 * the `active_org` cookie; other members are locked to their membership org.
 * Returns null when the user belongs to no org and none can be chosen.
 */
export async function getActiveOrg(
  session: SessionContext,
): Promise<Organization | null> {
  const membershipOrgIds = [
    ...new Set(session.memberships.map((m) => m.organizationId)),
  ];

  const candidates = session.isSuperAdmin
    ? await prisma.organization.findMany({ orderBy: { createdAt: "asc" } })
    : await prisma.organization.findMany({
        where: { id: { in: membershipOrgIds } },
        orderBy: { createdAt: "asc" },
      });

  const cookieOrgId = (await cookies()).get(COOKIE)?.value;
  const chosen = chooseActiveOrgId(
    membershipOrgIds,
    session.isSuperAdmin,
    cookieOrgId,
    candidates.map((o) => o.id),
  );
  return candidates.find((o) => o.id === chosen) ?? null;
}

/**
 * Set the active organization (super admin only). Validates the org exists
 * before writing the cookie.
 */
export async function setActiveOrg(
  session: SessionContext,
  orgId: string,
): Promise<void> {
  if (!session.isSuperAdmin) {
    throw new Error("Only super admins can switch organizations");
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Unknown organization");

  (await cookies()).set(COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
