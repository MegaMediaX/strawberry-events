import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { registrationClaimedEmail, type Locale } from "@/lib/email/templates";
import { linkOrdersToUser } from "./ledger";

/** `ahmad@example.com` → `a•••d@example.com`. Enough to recognise, not enough to reuse. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length < 2) return `•••@${domain ?? "…"}`;
  return `${local[0]}•••${local[local.length - 1]}@${domain}`;
}

/**
 * Which account, if any, a new registration should belong to.
 *
 * This is the point of the whole feature: once someone has an account with a
 * verified address, everything they register for afterwards belongs to it
 * without anybody claiming anything. Claiming becomes a one-time backfill for
 * the 2026 cohort rather than a permanent ceremony.
 *
 * Requires the address to be VERIFIED. An unverified account proves nothing
 * about the mailbox, and this runs with no human in the loop at all — there is
 * no token to hold and no code to type, so the account's own proof is the only
 * proof there is. Today that means it is inert for 68 of 74 accounts until the
 * verification route becomes something a person can find.
 *
 * Returns null rather than throwing: a registration must never fail because
 * ownership could not be decided.
 */
export async function resolveForwardLink(email: string): Promise<string | null> {
  const e = email?.toLowerCase().trim();
  // A registration with no address links to nobody. Same rule the claim path
  // enforces — with nothing to match on there is nothing to infer.
  if (!e) return null;

  /**
   * Everything below is inside one try.
   *
   * The comment above promised this never throws and it did — a lookup failure
   * propagated straight out and would have failed the whole registration, at a
   * door, over bookkeeping nobody was waiting for. The existing registration
   * suites caught it: they mock only the tables register() itself touches, so
   * `prisma.user` was undefined and every registration threw.
   *
   * Ownership is an optimisation. A registration that cannot decide its owner
   * is still a valid registration, and stays unowned.
   */
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: e },
      select: {
        id: true,
        status: true,
        emailVerified: true,
        memberships: { select: { id: true }, take: 1 },
      },
    });
  } catch (err) {
    console.error("[forward-link] owner lookup failed:", (err as Error).message);
    return null;
  }
  if (!user) return null;
  if (!user.emailVerified) return null;
  if (user.status === "suspended") return null;
  /**
   * Attendees and staff share one `users` table, and an organiser registering
   * for their own event is ordinary. Their registration simply stays unowned,
   * exactly as the link and claim paths refuse a staff account — this is a
   * consumer feature and admin identity is not part of it.
   */
  if (user.memberships.length > 0) return null;

  return user.id;
}

/**
 * Attach a freshly created registration to the account, and record it.
 *
 * Delegates to `linkOrdersToUser` rather than writing the ownership and the
 * ledger row separately. The first version set `userId` in the order's own
 * INSERT and wrote the ledger afterwards, outside any transaction — so a failed
 * ledger write left a permanently owned registration with no record and no
 * notice, which is precisely the silent back door this feature exists to close.
 * The shared path does ownership and ledger in one transaction, under a row
 * lock, and has been reviewed twice; there was no reason to hand-roll a second
 * one.
 *
 * The notice is deliberately NOT awaited. `sendEmail` has no configured socket
 * timeout, so a hung SMTP server would otherwise block the registrant's HTTP
 * response — at a door, on top of the confirmation mail this function already
 * waits on. Same `void` treatment the surrounding file gives its webhook
 * emissions.
 */
export async function applyForwardLink(params: {
  orderId: string;
  userId: string;
  locale: Locale;
}): Promise<void> {
  const { orderId, userId, locale } = params;
  try {
    const res = await linkOrdersToUser({
      orderIds: [orderId],
      userId,
      actor: { type: "system" },
      proofType: "forward_link",
      matchRule: "verified_email_at_registration",
    });
    if (!res.ok) {
      // Never fatal: the registration is committed and simply stays unowned.
      console.error("[forward-link] link refused:", res.error);
      return;
    }
    void notifyForwardLink(orderId, locale);
  } catch (err) {
    console.error("[forward-link] link failed:", (err as Error).message);
  }
}

/** Same notice a claim sends, to the address on the registration. */
async function notifyForwardLink(orderId: string, locale: Locale): Promise<void> {
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
    console.error("[forward-link] notice failed:", (err as Error).message);
  }
}
