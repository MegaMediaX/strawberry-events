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
  // Read as 0 when the claim is absent — see the version check below.
  const tokenVersion = session?.user?.sessionVersion ?? 0;

  // Suspended users are treated as unauthenticated — they cannot reach any
  // protected area (requireRole redirects them to login). sessionVersion rides
  // along on this same read so revocation costs no extra query.
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, sessionVersion: true },
  });
  if (!account || account.status === "suspended") return null;

  // Session revocation. Auth.js runs strategy: "jwt", so there is no session row
  // to delete server-side — a password reset would otherwise leave every token
  // minted before it valid until natural expiry, meaning a compromised account
  // stays compromised after the victim "fixes" it. resetPassword() increments
  // users.sessionVersion, and any token still carrying the old value dies here.
  //
  // A missing claim is read as 0, NOT as invalid. Tokens issued before this
  // column existed have no sessionVersion, and every pre-existing row defaults
  // to 0 — so the rollout logs nobody out. It gives up nothing: those accounts
  // have by definition not been reset since versioning existed, and the moment
  // one is reset the counter becomes 1 and the legacy token stops matching.
  if (tokenVersion !== account.sessionVersion) return null;

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, role: true, assignedEventIds: true, assignedSubEventIds: true },
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
