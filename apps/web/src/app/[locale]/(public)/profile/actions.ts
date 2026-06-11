"use server";

import { getSessionContext } from "@/lib/auth/session";
import { updateMyProfile, type ProfileInput } from "@/lib/portal/account";

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
}

export async function updateProfileAction(input: ProfileInput): Promise<ProfileActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  // updateMyProfile is hard-scoped to session.userId — the client cannot target
  // another user.
  await updateMyProfile(session, input);
  return { ok: true };
}
