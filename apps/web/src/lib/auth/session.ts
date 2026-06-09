import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./config";
import { prisma } from "@/lib/db/client";
import { assertRole } from "./guards";
import type { SessionContext, MemberRole } from "./types";

/**
 * Resolve the full authorization context for the current request, loading the
 * user's organization memberships. Returns null when not authenticated.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, role: true, assignedEventIds: true },
  });

  return {
    userId,
    isSuperAdmin: memberships.some((m) => m.role === "super_admin"),
    memberships,
    impersonating: false,
  };
}

/**
 * Require an authenticated session holding one of the given roles. Redirects to
 * login when unauthenticated; throws ForbiddenError when authenticated but
 * lacking the role.
 */
export async function requireRole(
  roles: MemberRole[],
  loginPath = "/en/login",
): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(loginPath);
  assertRole(ctx, roles);
  return ctx;
}
