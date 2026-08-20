"use server";

import { getSessionContext } from "@/lib/auth/session";
import { ADMIN_ROLES, STAFF_ROLES } from "@/lib/auth/areas";

/**
 * Where to send someone right after sign-in.
 *
 * Send them somewhere they can actually OPEN. This previously asked only
 * "do they hold any membership?" and sent every such person to /admin — but
 * /admin does not accept checkin_staff, so door staff were bounced back to
 * /login and it looked exactly like a rejected password.
 *
 * The role lists come from `areas.ts`, shared with the layouts that guard each
 * area, so this cannot drift out of step with them again.
 */
export async function landingPathAction(locale: string): Promise<string> {
  const session = await getSessionContext();
  if (!session) return `/${locale}/login`;
  if (session.isSuperAdmin) return `/${locale}/admin`;

  const held = new Set(session.memberships.map((m) => m.role));
  if (ADMIN_ROLES.some((r) => held.has(r))) return `/${locale}/admin`;
  // Check-in staff: the door screen is the whole job.
  if (STAFF_ROLES.some((r) => held.has(r))) return `/${locale}/staff`;

  // Attendees hold no membership — their tickets are the point.
  return `/${locale}/my-tickets`;
}
