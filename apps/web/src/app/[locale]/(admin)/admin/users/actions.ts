"use server";

import type { MemberRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { setUserStatus, changeRole, inviteUser, type InviteInput } from "@/lib/admin/users";
import type { Locale } from "@/lib/email/templates";

export interface ActionResult {
  ok: boolean;
  error?: string;
  warning?: string;
}

export async function inviteUserAction(
  locale: string,
  input: InviteInput,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const { emailSent } = await inviteUser(session, input, locale === "ar" ? "ar" : ("en" as Locale));
    revalidatePath(`/${locale}/admin/users`);
    return emailSent
      ? { ok: true }
      : { ok: true, warning: "User created, but the invite email could not be sent. Resend it from the user's page." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setStatusAction(userId: string, suspend: boolean): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await setUserStatus(session, userId, suspend ? "suspended" : "active");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function changeRoleAction(
  userId: string,
  organizationId: string,
  role: MemberRole,
  assignedEventIds: string[] = [],
  assignedSubEventIds: string[] = [],
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    let eventIds = assignedEventIds;
    if (role === "workshop_organiser") {
      if (assignedSubEventIds.length === 0) {
        return { ok: false, error: "Pick at least one session for a workshop organiser." };
      }
      // Derive the event gate from the chosen sessions. Asking an admin to pick
      // the event as well would be a second chance to get it wrong, and a
      // membership whose event does not contain its sessions sees nothing.
      const subEvents = await prisma.subEvent.findMany({
        where: { id: { in: assignedSubEventIds } },
        select: { eventMapping: { select: { organizationId: true, localEventId: true } } },
      });
      if (subEvents.length !== assignedSubEventIds.length) {
        return { ok: false, error: "One or more sessions no longer exist." };
      }
      if (subEvents.some((se) => se.eventMapping.organizationId !== organizationId)) {
        return { ok: false, error: "Those sessions belong to a different organization." };
      }
      eventIds = [...new Set(subEvents.map((se) => se.eventMapping.localEventId))];
    }
    await changeRole(session, userId, organizationId, role, eventIds, assignedSubEventIds);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
