import type { AttendeeOrder, AttendeeTag } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixCheckin from "@/lib/pretix/checkin";
import { emit } from "@/lib/webhooks/service";
import { checkinEligibility } from "./eligibility";

export interface CheckInResult {
  ok: boolean;
  reason?: string;
  badge?: {
    orderCode: string;
    tag: AttendeeTag;
    secret: string | null;
    fullName: string;
    company: string | null;
  };
}

function assertCanCheckin(session: SessionContext) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot check in while impersonating");
  }
  if (!hasAnyRole(session, ["checkin_staff", "organizer_admin"])) {
    throw new ForbiddenError("Requires check-in staff or organizer admin");
  }
}

async function resolveEvent(session: SessionContext, eventId: string) {
  const mapping = await prisma.eventMapping.findUnique({ where: { id: eventId } });
  if (
    !mapping ||
    !canAccessEvent(session, mapping.organizationId, mapping.localEventId)
  ) {
    throw new ForbiddenError("Event not found or access denied");
  }
  return mapping;
}

/** Search attendees within an event the session can access. */
export async function searchAttendees(
  session: SessionContext,
  eventId: string,
  query: string,
) {
  // Enforce check-in role at the service layer: the layout guard is UI-only,
  // but server actions are directly invocable, so a finance member could
  // otherwise harvest attendee PII (orderCode/email/name) through searchAction.
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);
  return searchAttendeeOrders(mapping.id, query);
}

/**
 * Minimum trigram word-similarity for a name to count as a fuzzy match.
 * "mohamad" vs "mouhamad" scores ~0.55, so 0.3 catches typos/spelling variants
 * comfortably while keeping unrelated names out. Tunable.
 */
export const NAME_SIMILARITY_THRESHOLD = 0.3;

/**
 * Search attendees within one event, typo-tolerantly.
 *
 * - order code / email / name: case-insensitive substring (exact-ish hits)
 * - name also: pg_trgm word_similarity, so "mohamad" matches "mouhamad"
 * - phone: digit-normalized on BOTH sides, so "+961 70 123 456", "70-123-456"
 *   and "70123456" all match a stored "70 123 456"
 *
 * Results are ranked by best name similarity first (exact substring = 1),
 * then most recent. Trigram GIN indexes (see the add_trgm_fuzzy_search
 * migration) keep this fast.
 */
export function searchAttendeeOrders(
  eventMappingId: string,
  query: string,
): Promise<AttendeeOrder[]> {
  const q = query.trim();
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const phoneClause =
    digits.length >= 3
      ? Prisma.sql`OR regexp_replace(coalesce("phone", ''), '\D', '', 'g') LIKE ${`%${digits}%`}`
      : Prisma.empty;

  return prisma.$queryRaw<AttendeeOrder[]>`
    SELECT *
    FROM "attendee_orders"
    WHERE "eventMappingId" = ${eventMappingId}
      AND (
        "orderCode" ILIKE ${like}
        OR "email" ILIKE ${like}
        OR "attendeeName" ILIKE ${like}
        OR word_similarity(${q}, coalesce("attendeeName", '')) >= ${NAME_SIMILARITY_THRESHOLD}
        ${phoneClause}
      )
    ORDER BY
      GREATEST(
        CASE WHEN "attendeeName" ILIKE ${like} THEN 1 ELSE 0 END,
        word_similarity(${q}, coalesce("attendeeName", ''))
      ) DESC,
      "createdAt" DESC
    LIMIT 25
  `;
}

/**
 * Check in an attendee: validates eligibility, redeems against the pretix
 * check-in list (source of truth), logs the badge print, and audits.
 */
export async function checkInOrder(
  session: SessionContext,
  eventId: string,
  orderCode: string,
  listId: number,
): Promise<CheckInResult> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);

  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, orderCode },
  });
  if (!order) throw new ForbiddenError("Registration not found");

  const elig = checkinEligibility(order);
  if (!elig.ok) return { ok: false, reason: elig.reason };

  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  const redeem = await pretixCheckin.redeemCheckin(
    ctx.organizerSlug,
    mapping.pretixEventSlug,
    listId,
    order.pretixSecret ?? order.orderCode,
    ctx.token,
  );
  if (redeem.status !== "ok") {
    return { ok: false, reason: redeem.reason ?? "Check-in failed" };
  }

  await prisma.badgePrintLog.create({
    data: {
      eventMappingId: mapping.id,
      attendeeRef: order.orderCode,
      printedByUserId: session.userId,
      reprint: false,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      actorUserId: session.userId,
      action: "attendee.checked_in",
      entityType: "order",
      entityId: order.id,
    },
  });

  void emit(mapping.organizationId, "checkin.created", { orderCode: order.orderCode }, mapping.id);
  void emit(mapping.organizationId, "badge.printed", { orderCode: order.orderCode }, mapping.id);

  return {
    ok: true,
    badge: {
      orderCode: order.orderCode,
      tag: order.roleTag,
      secret: order.pretixSecret,
      fullName: order.attendeeName ?? order.email,
      company: order.company,
    },
  };
}

/** Live counters for a check-in list (pretix source of truth). */
export async function liveCounters(
  session: SessionContext,
  eventId: string,
  listId: number,
) {
  const mapping = await resolveEvent(session, eventId);
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  return pretixCheckin.checkinCounters(ctx.organizerSlug, mapping.pretixEventSlug, listId, ctx.token);
}
