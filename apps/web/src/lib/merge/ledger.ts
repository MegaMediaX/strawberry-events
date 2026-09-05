import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * How long an operator can reverse a link without a fresh decision. Stored on
 * the row at write time rather than computed on read, so shortening this later
 * cannot silently re-close events that were still open when they were made.
 */
export const REVERSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ActorType = "self_claim" | "staff_override";
export type ProofType = "admin_override" | "magic_link" | "email_code" | "phone_code";

export interface Actor {
  type: ActorType;
  /** The operator. Required when type is staff_override — the DB enforces it too. */
  userId?: string;
  /**
   * The caller MUST resolve this through lib/security/client-ip.ts. It is a
   * plain string here and nothing in this module can verify it, so treat it as
   * a note about the request rather than as evidence on its own.
   */
  ip?: string;
}

/**
 * Thrown inside the transaction when an order moved between our read and our
 * write. THROWN, not returned: returning from a `$transaction` callback commits
 * it, so a guard that returned after a write would persist half the work.
 */
class ConcurrentChange extends Error {}

export interface LinkResult {
  ok: boolean;
  error?: string;
  eventId?: string;
  linked: number;
}

/** Refuse to put registrations on an account that can administer the event. */
async function holdsStaffMembership(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const m = await tx.organizationMember.findFirst({
    where: { userId },
    select: { id: true },
  });
  return m !== null;
}

/**
 * Attach registrations to an account, recording where each one came from.
 *
 * WRITES `attendee_orders.userId` AND NOTHING ELSE. Not attendeeName, company,
 * jobTitle, roleTag, roleLabel or pretixSecret — the badge renders from the
 * order row, so a link that touched those could change what prints at a door.
 *
 * The ledger row is written in the SAME transaction as the update. A link
 * without its record is worse than no link at all: with the merge notice now
 * email-only, this table is the only account of what happened.
 */
export async function linkOrdersToUser(params: {
  orderIds: string[];
  userId: string;
  actor: Actor;
  proofType: ProofType;
  reason?: string;
  matchRule?: string;
}): Promise<LinkResult> {
  const { orderIds, userId, actor, proofType, reason, matchRule } = params;

  if (orderIds.length === 0) return { ok: false, error: "No registrations selected.", linked: 0 };
  if (actor.type === "staff_override" && !actor.userId) {
    return { ok: false, error: "An operator action needs an operator.", linked: 0 };
  }
  if (actor.type === "staff_override" && !reason?.trim()) {
    return { ok: false, error: "A reason is required.", linked: 0 };
  }
  /**
   * An operator linking registrations to their OWN account is the one action
   * this table could never adjudicate — the person who would answer for it is
   * the person who did it. Refused outright rather than merely recorded.
   */
  if (actor.type === "staff_override" && actor.userId === userId) {
    return { ok: false, error: "An operator cannot link registrations to their own account.", linked: 0 };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!target) return { ok: false, error: "No such account.", linked: 0 };
      if (target.status === "suspended") {
        return { ok: false, error: "That account is suspended.", linked: 0 };
      }
      /**
       * Attendees and staff share one `users` table; `OrganizationMember` is
       * the only thing separating a door volunteer from a visitor. Checked
       * INSIDE the transaction — outside it, membership granted between the
       * check and the write would slip through.
       */
      if (await holdsStaffMembership(tx, userId)) {
        return { ok: false, error: "That account holds staff membership.", linked: 0 };
      }

      /**
       * Read the current owners HOLDING A ROW LOCK.
       *
       * `findMany` takes no lock and Prisma's default isolation is READ
       * COMMITTED, so two concurrent links both saw an order as unowned, both
       * recorded `previousUserId: null`, and the later commit silently
       * overwrote the earlier link. The ledger then claimed the order was
       * unowned before BOTH events, and reversing the later one restored null
       * rather than the owner the earlier one had established — the record
       * disagreeing with reality, in the one table that exists to be believed.
       * Measured before the fix, not theorised.
       *
       * `FOR UPDATE` makes the second caller wait instead of racing: it then
       * reads the committed result, records the real previous owner, and
       * succeeds. Serialising beats failing — an operator told to retry is
       * worse off than one who simply queued.
       *
       * `ORDER BY id` because reverseMergeEvent updates rows one at a time; a
       * consistent order stops the two deadlocking against each other.
       */
      const orders = await tx.$queryRaw<{ id: string; userId: string | null; email: string }[]>`
        SELECT id, "userId", email
        FROM attendee_orders
        WHERE id = ANY(${orderIds}::text[])
        ORDER BY id
        FOR UPDATE
      `;

      // Both guards below return BEFORE anything is written, which is the only
      // reason returning here is safe — see ConcurrentChange.
      if (orders.length !== orderIds.length) {
        return { ok: false, error: "Some registrations no longer exist.", linked: 0 };
      }

      /**
       * A blank email means the row can never be matched to a person by
       * address — these are the registrations taken at a door with nothing
       * recorded. Hand-linking them is legitimate and is the ONLY route they
       * have. A self-service claim reaching them is not: there is nothing for
       * the claimant to have proved. The claim path will carry its own guard;
       * this one is here so the rule does not depend on that path being written
       * correctly later.
       */
      if (actor.type === "self_claim" && orders.some((o) => !o.email?.trim())) {
        return { ok: false, error: "Those registrations must be linked by an organiser.", linked: 0 };
      }

      const movable = orders.filter((o) => o.userId !== userId);
      if (movable.length === 0) {
        return { ok: false, error: "Already linked to that account.", linked: 0 };
      }

      const event = await tx.accountMergeEvent.create({
        data: {
          userId,
          actorType: actor.type,
          actorUserId: actor.userId ?? null,
          proofType,
          matchRule: matchRule ?? null,
          reason: reason?.trim() || null,
          ip: actor.ip ?? null,
          reverseDeadline: new Date(Date.now() + REVERSE_WINDOW_MS),
        },
      });

      await tx.accountMergeEventEntity.createMany({
        data: movable.map((o) => ({
          mergeEventId: event.id,
          entityType: "attendee_order",
          entityId: o.id,
          previousUserId: o.userId,
        })),
      });

      /**
       * Compare-and-set against the owner we just read, behind the row lock.
       *
       * The lock should make this unreachable. It is kept because it costs one
       * predicate and turns "somebody wrote through a path that skipped the
       * lock" from a silently wrong ledger row into a rolled-back transaction.
       * If it ever fires, the locking discipline is broken somewhere.
       */
      for (const o of movable) {
        const res = await tx.attendeeOrder.updateMany({
          where: { id: o.id, userId: o.userId },
          data: { userId },
        });
        if (res.count !== 1) throw new ConcurrentChange();
      }

      return { ok: true, eventId: event.id, linked: movable.length };
    });
  } catch (err) {
    if (err instanceof ConcurrentChange) {
      return {
        ok: false,
        error: "Those registrations changed while you were working. Reload and try again.",
        linked: 0,
      };
    }
    throw err;
  }
}

/**
 * Put every registration in an event back where it came from.
 *
 * Driven off `previousUserId`, which is the whole reason that column exists.
 * Deleting the account is NOT this: `userId` is `onDelete: SetNull`, so that
 * detaches every order the person ever held, including ones this event never
 * touched.
 *
 * The event is marked reversed rather than deleted — an audit trail that can be
 * erased by the person being audited is not one.
 */
export async function reverseMergeEvent(params: {
  eventId: string;
  actor: Actor;
  reason: string;
}): Promise<LinkResult> {
  const { eventId, actor, reason } = params;

  if (actor.type === "staff_override" && !actor.userId) {
    return { ok: false, error: "An operator action needs an operator.", linked: 0 };
  }
  if (!reason?.trim()) return { ok: false, error: "A reason is required.", linked: 0 };

  return prisma.$transaction(async (tx) => {
    const event = await tx.accountMergeEvent.findUnique({
      where: { id: eventId },
      include: { entities: true },
    });
    if (!event) return { ok: false, error: "No such event.", linked: 0 };
    if (event.reversedAt) return { ok: false, error: "Already reversed.", linked: 0 };

    const orderEntities = event.entities.filter((e) => e.entityType === "attendee_order");

    /**
     * The staff-membership rule is about where registrations END UP, so it has
     * to hold on the way back too. A previous owner who has since been made an
     * organiser would otherwise receive the orders through the reversal — the
     * same invariant defeated from the other direction.
     */
    const restoringTo = [...new Set(orderEntities.map((e) => e.previousUserId).filter(Boolean))] as string[];
    for (const uid of restoringTo) {
      if (await holdsStaffMembership(tx, uid)) {
        return {
          ok: false,
          error: "A previous owner now holds staff membership; unlink to nobody instead.",
          linked: 0,
        };
      }
    }

    let restored = 0;
    for (const e of orderEntities) {
      // Scoped to the account this event moved the order TO. If the order has
      // since moved on, this event no longer owns its placement and must not
      // yank it back.
      const res = await tx.attendeeOrder.updateMany({
        where: { id: e.entityId, userId: event.userId },
        data: { userId: e.previousUserId },
      });
      restored += res.count;
    }

    /**
     * Only record a reversal that actually reversed something.
     *
     * Marking the event `reversedAt` when nothing moved would leave a row that
     * says "reversed" over ownership that never changed — and the
     * already-reversed guard above would then make it permanently unretryable.
     * A reversal that found nothing to do is a failure the operator needs to
     * see, not a fact to write down.
     */
    if (restored === 0) {
      return {
        ok: false,
        error: "Nothing to reverse — those registrations have already moved on.",
        linked: 0,
      };
    }

    await tx.accountMergeEvent.update({
      where: { id: eventId },
      data: {
        reversedAt: new Date(),
        reversedByUserId: actor.userId ?? null,
        reversedReason: reason.trim(),
        reversedCount: restored,
      },
    });

    return { ok: true, eventId, linked: restored };
  });
}

/**
 * Everything that has ever happened to one registration, newest first.
 *
 * The question an operator actually asks when somebody at a door says this is
 * not their ticket.
 */
export async function orderLinkHistory(orderId: string, take = 50) {
  const entities = await prisma.accountMergeEventEntity.findMany({
    where: { entityType: "attendee_order", entityId: orderId },
    include: { mergeEvent: true },
    orderBy: { mergeEvent: { createdAt: "desc" } },
    take,
  });
  return entities.map((e) => ({
    eventId: e.mergeEventId,
    previousUserId: e.previousUserId,
    linkedToUserId: e.mergeEvent.userId,
    actorType: e.mergeEvent.actorType,
    actorUserId: e.mergeEvent.actorUserId,
    proofType: e.mergeEvent.proofType,
    matchRule: e.mergeEvent.matchRule,
    reason: e.mergeEvent.reason,
    at: e.mergeEvent.createdAt,
    reversedAt: e.mergeEvent.reversedAt,
    reversedReason: e.mergeEvent.reversedReason,
    reversedCount: e.mergeEvent.reversedCount,
    reversible: !e.mergeEvent.reversedAt && e.mergeEvent.reverseDeadline > new Date(),
  }));
}
