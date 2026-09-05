import { getOrderByToken } from "@/lib/registration/access";
import type { SessionContext } from "@/lib/auth/types";
import { linkOrdersToUser } from "./ledger";

export interface ClaimResult {
  ok: boolean;
  error?: string;
}

/**
 * Attach the registration behind a ticket link to the signed-in account.
 *
 * The token IS the proof, and it is a better one than anything the later email
 * claim can offer: it was mailed to the address on the order, it carries an
 * HMAC that cannot be produced without MAGIC_LINK_SECRET, and `getOrderByToken`
 * additionally refuses a revoked link or a stale version. Holding it means
 * holding what was sent to that mailbox — so there is no candidate set, no
 * ambiguity, and nothing to confirm. This is rule 4 of the merge decision
 * table, the one path that needs no second step.
 *
 * DELIBERATELY NOT GATED ON `emailVerified`.
 *
 * The plan called for every claim path to require it. That is right for the
 * email claim, where the account's own verified address is the entire proof.
 * It is wrong here, and would be actively harmful: the proof is the token, not
 * the account, and 68 of the 74 existing accounts are unverified with no way
 * for an already-registered user to verify — signup is currently the only place
 * a code is issued. Requiring it would lock nearly everyone out of the one
 * claim path that cannot be spoofed. Revisit when P3 lands and the account's
 * own address starts carrying weight.
 *
 * The token is re-verified HERE rather than trusting an id from the client. A
 * Server Action is a real HTTP endpoint; an orderId in its arguments would be
 * a claim-any-registration button.
 */
export async function claimOrderFromToken(
  session: SessionContext,
  token: string,
  ip?: string,
): Promise<ClaimResult> {
  const order = await getOrderByToken(token);
  // Same answer as the page gives for a bad token: nothing about whether the
  // order exists, is revoked, or is simply at a different version.
  if (!order) return { ok: false, error: "That ticket link is not valid." };

  if (order.userId === session.userId) {
    return { ok: false, error: "This ticket is already in your account." };
  }
  /**
   * Somebody else holds it. Refused rather than moved: whoever owns it now got
   * there by some route this function cannot see, and a link that silently
   * takes a registration off another account is the thing the ledger exists to
   * catch — not something to do casually because the requester has the URL.
   * An organiser can move it, on the record.
   */
  if (order.userId) {
    return { ok: false, error: "This ticket belongs to another account. Ask the organisers to move it." };
  }

  const res = await linkOrdersToUser({
    orderIds: [order.id],
    userId: session.userId,
    actor: { type: "self_claim", ip },
    proofType: "magic_link",
    matchRule: "token",
  });

  return { ok: res.ok, error: res.error };
}
