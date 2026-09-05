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
  ip?: string;
}

export interface LinkResult {
  ok: boolean;
  error?: string;
  eventId?: string;
  linked: number;
}

/**
 * Attach registrations to an account, recording where each one came from.
 *
 * WRITES `attendee_orders.userId` AND NOTHING ELSE. Not attendeeName, company,
 * jobTitle, roleTag, roleLabel or pretixSecret — the badge renders from the
 * order row, so a merge that touched those could change what prints at a door.
 * That rule is the reason "her badge shows the wrong company" cannot be caused
 * by a link, and it is enforced by a test that compares the whole row before
 * and after.
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

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { select: { id: true }, take: 1 } },
  });
  if (!target) return { ok: false, error: "No such account.", linked: 0 };

  /**
   * Attendees and staff share one `users` table; `OrganizationMember` is the
   * only thing separating a door volunteer from a visitor. Refusing here keeps
   * a claim from ever landing on an account that holds admin membership —
   * cheap to enforce, and the alternative is an attendee-facing flow with a
   * path into a staff account.
   */
  if (target.memberships.length > 0) {
    return { ok: false, error: "That account holds staff membership.", linked: 0 };
  }
  if (target.status === "suspended") {
    return { ok: false, error: "That account is suspended.", linked: 0 };
  }

  return prisma.$transaction(async (tx) => {
    // Read the current owners INSIDE the transaction: previousUserId recorded
    // from a stale read is what makes an un-merge restore the wrong owner, and
    // that failure is silent.
    const orders = await tx.attendeeOrder.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, userId: true },
    });
    if (orders.length !== orderIds.length) {
      return { ok: false, error: "Some registrations no longer exist.", linked: 0 };
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

    await tx.attendeeOrder.updateMany({
      where: { id: { in: movable.map((o) => o.id) } },
      data: { userId },
    });

    return { ok: true, eventId: event.id, linked: movable.length };
  });
}

/**
 * Put every registration in an event back where it came from.
 *
 * One statement per entity type driven off `previousUserId`, which is the whole
 * reason that column exists. Deleting the account is NOT this: `userId` is
 * `onDelete: SetNull`, so that detaches every order the person ever held,
 * including ones this event never touched.
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

    let restored = 0;
    for (const e of event.entities) {
      if (e.entityType !== "attendee_order") continue;
      // Scoped to the account this event moved the order TO. If the order has
      // since moved on, this event is no longer the thing that owns its
      // placement and must not yank it back.
      const res = await tx.attendeeOrder.updateMany({
        where: { id: e.entityId, userId: event.userId },
        data: { userId: e.previousUserId },
      });
      restored += res.count;
    }

    await tx.accountMergeEvent.update({
      where: { id: eventId },
      data: {
        reversedAt: new Date(),
        reversedByUserId: actor.userId ?? null,
        reversedReason: reason.trim(),
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
export async function orderLinkHistory(orderId: string) {
  const entities = await prisma.accountMergeEventEntity.findMany({
    where: { entityType: "attendee_order", entityId: orderId },
    include: { mergeEvent: true },
    orderBy: { mergeEvent: { createdAt: "desc" } },
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
    reversible: !e.mergeEvent.reversedAt && e.mergeEvent.reverseDeadline > new Date(),
  }));
}
