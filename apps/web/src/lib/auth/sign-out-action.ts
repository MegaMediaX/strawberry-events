"use server";

import { signOut } from "@/lib/auth/config";

/** Sign the current user out and return them to the public events page. */
export async function signOutAction(locale: string): Promise<void> {
  await signOut({ redirectTo: `/${locale}/events` });
}
