import type { MemberRole } from "@prisma/client";

/**
 * Which roles may open which part of the app.
 *
 * ONE definition, imported by the layouts that guard each area and by the
 * post-login redirect. They used to encode this separately, and drifted: login
 * sent anyone holding a membership to /admin, but /admin does not accept
 * checkin_staff. A check-in account therefore signed in successfully, was
 * bounced straight back to /login, and looked for all the world like a wrong
 * password — which is an expensive thing to debug on a door laptop.
 */
export const ADMIN_ROLES: MemberRole[] = [
  "super_admin",
  "organizer_admin",
  "finance",
  "workshop_organiser",
];

export const STAFF_ROLES: MemberRole[] = [
  "super_admin",
  "organizer_admin",
  "checkin_staff",
];
