"use server";

import type { MemberRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { setUserStatus, changeRole, inviteUser, type InviteInput } from "@/lib/admin/users";
import type { Locale } from "@/lib/email/templates";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function inviteUserAction(
  locale: string,
  input: InviteInput,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await inviteUser(session, input, locale === "ar" ? "ar" : ("en" as Locale));
    revalidatePath(`/${locale}/admin/users`);
    return { ok: true };
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
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    await changeRole(session, userId, organizationId, role, assignedEventIds);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
