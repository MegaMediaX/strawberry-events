import type { AttendeeTag } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixCheckin from "@/lib/pretix/checkin";
import { checkinEligibility } from "./eligibility";

export interface CheckInResult {
  ok: boolean;
  reason?: string;
  badge?: { orderCode: string; tag: AttendeeTag; secret: string | null };
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
  const mapping = await resolveEvent(session, eventId);
  return prisma.attendeeOrder.findMany({
    where: {
      eventMappingId: mapping.id,
      OR: [
        { orderCode: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 25,
    orderBy: { createdAt: "desc" },
  });
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

  return {
    ok: true,
    badge: { orderCode: order.orderCode, tag: order.roleTag, secret: order.pretixSecret },
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
