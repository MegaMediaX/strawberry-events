import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { registrationClaimedEmail, type Locale } from "@/lib/email/templates";
import { REVERSE_WINDOW_MS } from "./ledger";

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
 * Record a forward link, after the registration row exists.
 *
 * Forward-linking would otherwise be the one way a registration becomes owned
 * with NO ledger row and NO notice — a silent back door around every rule the
 * other two paths follow. It is also the poisoning case: on a shared mailbox,
 * whoever verified the address first quietly receives every colleague's future
 * registration. So it writes the same event and sends the same notice, and the
 * invariant holds that every owned registration has a ledger entry explaining
 * why.
 *
 * Best-effort and after the fact. A registration that succeeded must never be
 * reported as failed because bookkeeping or SMTP was unavailable — but the
 * failure is logged rather than swallowed.
 */
export async function recordForwardLink(params: {
  orderId: string;
  userId: string;
  locale: Locale;
}): Promise<void> {
  const { orderId, userId, locale } = params;
  try {
    const event = await prisma.accountMergeEvent.create({
      data: {
        userId,
        // Neither a person claiming nor an operator deciding: nobody chose this
        // one, the system inferred it from an address already proved.
        actorType: "system",
        actorUserId: null,
        proofType: "forward_link",
        matchRule: "verified_email_at_registration",
        reverseDeadline: new Date(Date.now() + REVERSE_WINDOW_MS),
      },
    });
    await prisma.accountMergeEventEntity.create({
      data: {
        mergeEventId: event.id,
        entityType: "attendee_order",
        entityId: orderId,
        // Newly created, so it belonged to nobody a moment ago.
        previousUserId: null,
      },
    });

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
    console.error("[forward-link] bookkeeping failed:", (err as Error).message);
  }
}
