"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";
import { claimOrderFromToken, type ClaimResult } from "@/lib/merge/claim";

/**
 * The token comes from the page's own URL, and is re-verified inside
 * `claimOrderFromToken` rather than trusted here — a Server Action is a real
 * HTTP endpoint, so anything it accepts, an unauthenticated caller can POST.
 */
export async function claimTicketAction(
  locale: string,
  token: string,
): Promise<ClaimResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sign in first." };

  // A claim is cheap and idempotent, but this endpoint takes a token and tells
  // you whether it resolves — throttled so it cannot be used to sweep for live
  // links. Signature-forgery is already infeasible; this bounds the noise.
  const ip = await clientIp();
  if (!rateLimit(`claim-ticket:${ip}`, 20, 60_000).allowed) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }

  const res = await claimOrderFromToken(session, token, ip);
  if (res.ok) {
    revalidatePath(`/${locale}/t/${token}`);
    revalidatePath(`/${locale}/my-registrations`);
  }
  return res;
}
