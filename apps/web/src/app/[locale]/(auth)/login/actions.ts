"use server";

import { getSessionContext } from "@/lib/auth/session";

/**
 * Where to send a user right after sign-in. Staff/admins (anyone with an org
 * membership, or a super admin) go to the admin console; everyone else — i.e.
 * attendees, who are role-less — goes to their ticket portal. Previously login
 * always pushed to /admin, which 403'd the largest user group.
 */
export async function landingPathAction(locale: string): Promise<string> {
  const session = await getSessionContext();
  if (!session) return `/${locale}/login`;
  const privileged = session.isSuperAdmin || session.memberships.length > 0;
  return privileged ? `/${locale}/admin` : `/${locale}/my-tickets`;
}
