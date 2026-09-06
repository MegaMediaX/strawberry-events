import { getOrderByToken } from "@/lib/registration/access";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { registrationClaimedEmail, type Locale } from "@/lib/email/templates";
import type { SessionContext } from "@/lib/auth/types";
import { linkOrdersToUser, orderLinkHistory } from "./ledger";

export interface ClaimResult {
  ok: boolean;
  error?: string;
}

/** `ahmad@example.com` → `a•••d@example.com`. Enough to recognise, not enough to reuse. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length < 2) return `•••@${domain ?? "…"}`;
  return `${local[0]}•••${local[local.length - 1]}@${domain}`;
}

/**
 * Attach the registration behind a ticket link to the signed-in account.
 *
 * The token IS the proof, and a better one than the later email claim can
 * offer: it was mailed to the address on the order, carries an HMAC that cannot
 * be produced without MAGIC_LINK_SECRET, and `getOrderByToken` additionally
 * refuses a revoked link or a stale version. Holding it means holding what was
 * sent to that mailbox — no candidate set, no ambiguity, nothing to confirm.
 * Rule 4 of the merge decision table.
 *
 * NOT GATED ON `emailVerified`. That gate is right for the email claim, where
 * the account's own verified address is the entire proof. Here the proof is the
 * token, and 68 of 74 existing accounts are unverified behind a verification
 * flow they cannot discover. An attacker who signs up under an address they do
 * not control gains nothing on this path: they still need the mailed token.
 *
 * The token is re-verified HERE rather than trusting an id from the client. A
 * Server Action is a real HTTP endpoint; an orderId in its arguments would be a
 * claim-any-registration button.
 */
export async function claimOrderFromToken(
  session: SessionContext,
  token: string,
  ip?: string,
  locale: Locale = "en",
): Promise<ClaimResult> {
  const order = await getOrderByToken(token);
  // Same answer the page gives for a bad token: nothing about whether the order
  // exists, is revoked, or is simply at a different version.
  if (!order) return { ok: false, error: "That ticket link is not valid." };

  if (order.userId === session.userId) {
    return { ok: false, error: "This ticket is already in your account." };
  }
  /**
   * Somebody else holds it. Refused rather than moved: whoever owns it now got
   * there by a route this function cannot see, and silently taking a
   * registration off another account is the thing the ledger exists to catch.
   * An organiser can move it, on the record.
   */
  if (order.userId) {
    return { ok: false, error: "This ticket belongs to another account. Ask the organisers to move it." };
  }

  const history = await orderLinkHistory(order.id);

  /**
   * An operator's decision must not be undoable by the party it removed.
   *
   * Unlinking sets `userId` back to null and deliberately does NOT revoke the
   * ticket link — revoking would cost that person entry, and the house rule is
   * that a privacy action never does. But that leaves the ownership gate above
   * satisfied again, so the same visitor holding the same email could simply
   * click Save once more and put it straight back, logged as an ordinary first
   * claim. The remediation the operator screens exist to provide would be
   * reversible by exactly the person it was used against.
   *
   * So: once an organiser has detached this registration, only an organiser
   * re-attaches it.
   */
  const lastOperatorDetach = history.find((h) => h.reversedAt && h.reversedByUserId);
  if (lastOperatorDetach) {
    return {
      ok: false,
      error: "An organiser unlinked this registration. Please contact them to have it re-linked.",
    };
  }

  const res = await linkOrdersToUser({
    orderIds: [order.id],
    userId: session.userId,
    actor: { type: "self_claim", ip },
    proofType: "magic_link",
    matchRule: "token",
  });
  if (!res.ok) return { ok: res.ok, error: res.error };

  await notifyRegistrationClaimed(order.id, locale);
  return { ok: true };
}

/**
 * Tell the address on the registration that it was claimed.
 *
 * Sent to the ORDER's address, not the claimant's — the whole point is to reach
 * the person the ticket was originally mailed to, who may not be the person who
 * just clicked. Best-effort: a claim that succeeded must not be reported as
 * failed because SMTP was down, but the failure must not vanish either.
 */
async function notifyRegistrationClaimed(orderId: string, locale: Locale): Promise<void> {
  try {
    const order = await prisma.attendeeOrder.findUnique({
      where: { id: orderId },
      select: {
        orderCode: true,
        email: true,
        eventMapping: { select: { titleEn: true, organizationId: true } },
        user: { select: { email: true } },
      },
    });
    // No address on the order means nobody to tell. Those registrations cannot
    // be self-claimed anyway — the ledger refuses them.
    if (!order?.email?.trim()) return;

    await sendEmail(
      {
        to: order.email,
        ...registrationClaimedEmail(locale, {
          orderCode: order.orderCode,
          eventName: order.eventMapping.titleEn,
          maskedEmail: maskEmail(order.user?.email ?? ""),
        }),
      },
      {
        templateType: "registration_claimed",
        organizationId: order.eventMapping.organizationId,
        attendeeRef: order.orderCode,
      },
    );
  } catch (err) {
    console.error("[claim] claim notice failed:", (err as Error).message);
  }
}
