import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { linkOrdersToUser, reverseMergeEvent, orderLinkHistory } from "./ledger";

/**
 * Who may move a registration between accounts.
 *
 * Deliberately narrower than the admin area as a whole: finance and
 * workshop_organiser can open /admin, and neither has any business changing who
 * owns a registration. checkin_staff least of all — the door needs to find and
 * print, never to re-own.
 */
const MERGE_ROLES = ["super_admin", "organizer_admin"] as const;

export interface OperatorResult {
  ok: boolean;
  error?: string;
}

function assertMayMerge(session: SessionContext) {
  if (!hasAnyRole(session, [...MERGE_ROLES])) {
    throw new ForbiddenError("Not allowed to change registration ownership.");
  }
  /**
   * Blocked while impersonating, like marking an order paid. The ledger records
   * an operator id, and under impersonation that id names the person being
   * impersonated — so the record would be accurate about the account and wrong
   * about the human, which is the one thing an audit trail cannot be.
   */
  if (session.impersonating) {
    throw new ForbiddenError("Not available while impersonating.");
  }
}

/**
 * One registration, with its account and its whole link history — but only if
 * this operator may see that event.
 *
 * Org isolation is enforced HERE rather than in the page, the same way
 * `getApproval` does it: a page that forgets the check is a page that shows
 * another organiser's attendee.
 */
export async function getOrderForOperator(session: SessionContext, orderId: string) {
  assertMayMerge(session);

  const order = await prisma.attendeeOrder.findUnique({
    where: { id: orderId },
    include: {
      eventMapping: { select: { titleEn: true, organizationId: true, localEventId: true } },
      user: { select: { id: true, email: true, name: true, emailVerified: true } },
    },
  });
  if (!order) return null;
  if (
    !canAccessEvent(session, order.eventMapping.organizationId, order.eventMapping.localEventId)
  ) {
    return null;
  }

  return { order, history: await orderLinkHistory(order.id) };
}

/**
 * Link a registration to the account holding a given address.
 *
 * The operator types an email rather than a user id because an email is what
 * the person at the desk can actually read off a screen or a phone. Resolving
 * it here keeps the id out of the UI entirely.
 */
export async function linkOrderByEmail(
  session: SessionContext,
  params: { orderId: string; email: string; reason: string; ip?: string },
): Promise<OperatorResult> {
  assertMayMerge(session);

  const scoped = await getOrderForOperator(session, params.orderId);
  if (!scoped) return { ok: false, error: "No such registration." };

  const email = params.email.toLowerCase().trim();
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  // Said plainly: an operator typing an address at a desk needs to know it does
  // not exist. The neutrality that protects the public signup form would only
  // waste their time here, and they can already see the attendee list.
  if (!target) return { ok: false, error: "No account with that email address." };

  const res = await linkOrdersToUser({
    orderIds: [scoped.order.id],
    userId: target.id,
    actor: { type: "staff_override", userId: session.userId, ip: params.ip },
    proofType: "admin_override",
    reason: params.reason,
  });
  return { ok: res.ok, error: res.error };
}

/**
 * Detach a registration from whatever account holds it.
 *
 * Prefers reversing the event that linked it, so the ledger tells one story
 * rather than two. Falls back to a plain detach — recorded as its own event —
 * when there is no reversible event, which is the case for anything linked
 * before this ledger existed.
 */
export async function unlinkOrder(
  session: SessionContext,
  params: { orderId: string; reason: string; ip?: string },
): Promise<OperatorResult> {
  assertMayMerge(session);

  const scoped = await getOrderForOperator(session, params.orderId);
  if (!scoped) return { ok: false, error: "No such registration." };
  if (!scoped.order.userId) return { ok: false, error: "That registration is not linked." };

  const open = scoped.history.find((h) => !h.reversedAt && h.linkedToUserId === scoped.order.userId);
  if (open) {
    const res = await reverseMergeEvent({
      eventId: open.eventId,
      actor: { type: "staff_override", userId: session.userId, ip: params.ip },
      reason: params.reason,
    });
    return { ok: res.ok, error: res.error };
  }

  /**
   * No event to reverse: the link predates the ledger. Record the detach as a
   * merge event whose entity moves FROM the current owner TO nobody, so the
   * history is still complete rather than showing an order that silently
   * became unowned.
   */
  const previousUserId = scoped.order.userId;
  await prisma.$transaction(async (tx) => {
    const event = await tx.accountMergeEvent.create({
      data: {
        userId: previousUserId,
        actorType: "staff_override",
        actorUserId: session.userId,
        proofType: "admin_override",
        reason: params.reason.trim(),
        ip: params.ip ?? null,
        reverseDeadline: new Date(),
        reversedAt: new Date(),
        reversedByUserId: session.userId,
        reversedReason: params.reason.trim(),
        reversedCount: 1,
      },
    });
    await tx.accountMergeEventEntity.create({
      data: {
        mergeEventId: event.id,
        entityType: "attendee_order",
        entityId: scoped.order.id,
        previousUserId,
      },
    });
    await tx.attendeeOrder.updateMany({
      where: { id: scoped.order.id, userId: previousUserId },
      data: { userId: null },
    });
  });

  return { ok: true };
}

/**
 * The ledger, newest first, limited to events touching events this operator may
 * see. Filtering happens after the read because an event's scope lives on the
 * registrations it moved, not on the event row.
 */
export async function listMergeEvents(session: SessionContext, take = 100) {
  assertMayMerge(session);

  const events = await prisma.accountMergeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { entities: true },
  });
  if (events.length === 0) return [];

  const orderIds = [...new Set(events.flatMap((e) => e.entities.map((x) => x.entityId)))];
  const orders = await prisma.attendeeOrder.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      orderCode: true,
      eventMapping: { select: { titleEn: true, organizationId: true, localEventId: true } },
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));

  const userIds = [...new Set(events.flatMap((e) => [e.userId, e.actorUserId].filter(Boolean)))] as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return events
    .map((e) => {
      const visible = e.entities
        .map((x) => byId.get(x.entityId))
        .filter((o): o is NonNullable<typeof o> =>
          Boolean(
            o &&
              canAccessEvent(session, o.eventMapping.organizationId, o.eventMapping.localEventId),
          ),
        );
      return { event: e, orders: visible };
    })
    // An event whose registrations all belong to another organiser is not this
    // operator's business, and its actor/target addresses would leak if shown.
    .filter((row) => row.orders.length > 0)
    .map((row) => ({
      id: row.event.id,
      at: row.event.createdAt,
      accountEmail: emailById.get(row.event.userId) ?? "(deleted account)",
      actorEmail: row.event.actorUserId
        ? emailById.get(row.event.actorUserId) ?? "(deleted account)"
        : null,
      actorType: row.event.actorType,
      proofType: row.event.proofType,
      matchRule: row.event.matchRule,
      reason: row.event.reason,
      reversedAt: row.event.reversedAt,
      reversedReason: row.event.reversedReason,
      reversedCount: row.event.reversedCount,
      reversible: !row.event.reversedAt && row.event.reverseDeadline > new Date(),
      orders: row.orders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        event: o.eventMapping.titleEn,
      })),
    }));
}

/** Reverse one event from the ledger screen, org-checked through its orders. */
export async function reverseFromLedger(
  session: SessionContext,
  params: { eventId: string; reason: string; ip?: string },
): Promise<OperatorResult> {
  assertMayMerge(session);

  const visible = await listMergeEvents(session, 500);
  if (!visible.some((e) => e.id === params.eventId)) {
    return { ok: false, error: "No such event." };
  }

  const res = await reverseMergeEvent({
    eventId: params.eventId,
    actor: { type: "staff_override", userId: session.userId, ip: params.ip },
    reason: params.reason,
  });
  return { ok: res.ok, error: res.error };
}
