"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { setActiveOrg } from "@/lib/auth/active-org.server";

export async function switchOrgAction(orgId: string): Promise<void> {
  const session = await getSessionContext();
  if (!session) throw new Error("Not authenticated");
  await setActiveOrg(session, orgId);
  revalidatePath("/", "layout");
}
