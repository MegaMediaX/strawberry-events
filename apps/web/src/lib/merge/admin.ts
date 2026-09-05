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

/** Thrown to roll back the legacy-detach transaction; returning would commit it. */
class DetachConflict extends Error {}

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

  /**
   * Checked HERE, not only in ledger.ts. The legacy-detach branch below writes
   * its own event rather than going through reverseMergeEvent, so it would
   * otherwise skip the reason requirement entirely — and `unlinkAction` is a
   * real HTTP endpoint, so the disabled button in the UI is not a gate.
   */
  if (!params.reason?.trim()) return { ok: false, error: "A reason is required." };

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
  try {
    await prisma.$transaction(async (tx) => {
      /**
       * Lock the row before writing the event that describes moving it.
       * Without this the owner can change between the read above and the write
       * below: zero rows update, and a ledger row still claims a completed
       * detach that never happened. Same reasoning — and the same FOR UPDATE —
       * as linkOrdersToUser.
       */
      const locked = await tx.$queryRaw<{ id: string; userId: string | null }[]>`
        SELECT id, "userId" FROM attendee_orders WHERE id = ${scoped.order.id} FOR UPDATE
      `;
      if (locked[0]?.userId !== previousUserId) throw new DetachConflict();

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
      const moved = await tx.attendeeOrder.updateMany({
        where: { id: scoped.order.id, userId: previousUserId },
        data: { userId: null },
      });
      // The count is the whole point: a ledger row saying "detached" over an
      // order that never moved is exactly the lie this table cannot tell.
      if (moved.count !== 1) throw new DetachConflict();
    });
  } catch (err) {
    if (err instanceof DetachConflict) {
      return {
        ok: false,
        error: "That registration changed while you were working. Reload and try again.",
      };
    }
    throw err;
  }

  return { ok: true };
}

/**
 * Ids of the newest ledger events this operator may see, scoped IN THE QUERY.
 *
 * The obvious version — read the newest N events, then filter by organisation
 * in JS — is wrong in a way that hides the audit trail rather than leaking it.
 * A busier neighbour fills the whole window with their own events and this
 * organisation's ledger renders EMPTY. Measured: with 120 events in one org and
 * 1 in another, the smaller org saw 0 of 121.
 *
 * That is not a cosmetic paging bug. This table is the only account of a
 * disputed link, so a screen that silently shows nothing is the failure mode
 * the ledger exists to prevent.
 *
 * Only super_admin and organizer_admin reach these functions and both have
 * org-wide event access, so membership organisation ids are the correct scope —
 * no per-event narrowing is needed here (canAccessEvent still runs per order
 * when the rows are rendered, which keeps this honest if MERGE_ROLES widens).
 *
 * Raw SQL because `AccountMergeEventEntity.entityId` is a bare string with no
 * foreign key to attendee_orders, so Prisma cannot express this join.
 */
async function visibleEventIds(session: SessionContext, take: number): Promise<string[]> {
  if (session.isSuperAdmin) {
    const rows = await prisma.accountMergeEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  const orgIds = [...new Set(session.memberships.map((m) => m.organizationId))];
  if (orgIds.length === 0) return [];

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT e.id
    FROM account_merge_events e
    WHERE EXISTS (
      SELECT 1
      FROM account_merge_event_entities en
      JOIN attendee_orders o ON o.id = en."entityId"
      JOIN event_mappings m ON m.id = o."eventMappingId"
      WHERE en."mergeEventId" = e.id
        AND en."entityType" = 'attendee_order'
        AND m."organizationId" = ANY(${orgIds}::text[])
    )
    ORDER BY e."createdAt" DESC
    LIMIT ${take}
  `;
  return rows.map((r) => r.id);
}

/**
 * The ledger, newest first, limited to events touching events this operator may
 * see. Filtering happens after the read because an event's scope lives on the
 * registrations it moved, not on the event row.
 */
export async function listMergeEvents(session: SessionContext, take = 100) {
  assertMayMerge(session);

  const ids = await visibleEventIds(session, take);
  if (ids.length === 0) return [];

  const events = await prisma.accountMergeEvent.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { entities: true },
  });

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

  /**
   * Authorize THIS event, rather than asking whether it appears in a page of
   * recent ones. The window version refused a legitimate reversal whenever the
   * event had aged out of the newest N — the 30-day window says an event is
   * reversible, so paging must not be what decides it.
   */
  if (!(await eventIsVisible(session, params.eventId))) {
    return { ok: false, error: "No such event." };
  }

  /**
   * Visible is not the same as wholly mine.
   *
   * `eventIsVisible` asks whether ANY entity on the event belongs to this
   * organisation, but `reverseMergeEvent` restores EVERY entity on it. One
   * event spanning two organisations would let an operator who can see their
   * own half move the other half too — a cross-organisation write authorised by
   * partial visibility.
   *
   * No current caller can create such an event: this file links one order at a
   * time. `linkOrdersToUser` takes an array though, and the self-claim path is
   * exactly the caller that will match one person's address across several
   * events. Refusing now costs nothing and closes it before that lands.
   */
  if (await eventSpansOtherOrganisations(session, params.eventId)) {
    return {
      ok: false,
      error: "That link covers registrations outside your organisation. Unlink them individually.",
    };
  }

  const res = await reverseMergeEvent({
    eventId: params.eventId,
    actor: { type: "staff_override", userId: session.userId, ip: params.ip },
    reason: params.reason,
  });
  return { ok: res.ok, error: res.error };
}

/** The same scope test as `visibleEventIds`, for one event and no paging. */
async function eventIsVisible(session: SessionContext, eventId: string): Promise<boolean> {
  if (session.isSuperAdmin) {
    return (await prisma.accountMergeEvent.count({ where: { id: eventId } })) > 0;
  }
  const orgIds = [...new Set(session.memberships.map((m) => m.organizationId))];
  if (orgIds.length === 0) return false;

  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM account_merge_event_entities en
      JOIN attendee_orders o ON o.id = en."entityId"
      JOIN event_mappings m ON m.id = o."eventMappingId"
      WHERE en."mergeEventId" = ${eventId}
        AND en."entityType" = 'attendee_order'
        AND m."organizationId" = ANY(${orgIds}::text[])
    ) AS ok
  `;
  return rows[0]?.ok === true;
}

/**
 * True when the event touches at least one registration this operator may NOT
 * see. Counts the entities that fall outside the caller's organisations rather
 * than the ones inside, because it is the outsiders that make a whole-event
 * reversal unsafe.
 */
async function eventSpansOtherOrganisations(
  session: SessionContext,
  eventId: string,
): Promise<boolean> {
  if (session.isSuperAdmin) return false;
  const orgIds = [...new Set(session.memberships.map((m) => m.organizationId))];
  if (orgIds.length === 0) return true;

  const rows = await prisma.$queryRaw<{ outside: bigint }[]>`
    SELECT count(*) AS outside
    FROM account_merge_event_entities en
    JOIN attendee_orders o ON o.id = en."entityId"
    JOIN event_mappings m ON m.id = o."eventMappingId"
    WHERE en."mergeEventId" = ${eventId}
      AND en."entityType" = 'attendee_order'
      AND NOT (m."organizationId" = ANY(${orgIds}::text[]))
  `;
  return Number(rows[0]?.outside ?? 0) > 0;
}
