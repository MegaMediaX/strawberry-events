import { withApi, methodNotAllowed, resolveApiEvent } from "@/lib/api/handler";
import { ok, fail, readPaging, paginationMeta } from "@/lib/api/response";
import { checkinDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listCheckinLists, redeemCheckin } from "@/lib/pretix/checkin";
import { checkinEligibility } from "@/lib/checkin/eligibility";
import { selectListIdForDate, venueToday } from "@/lib/checkin/select-list";
import { VENUE_IANA_ZONE } from "@/lib/datetime/uk";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "checkins:read", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    const url = new URL(request.url);
    const { page, perPage, skip, take } = readPaging(url);
    const where = { eventMappingId: event.id };
    const [rows, total] = await Promise.all([
      prisma.badgePrintLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.badgePrintLog.count({ where }),
    ]);
    return ok(rows.map(checkinDTO), paginationMeta(page, perPage, total));
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "checkins:write", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    let b: { orderCode?: string; listId?: number };
    try {
      b = await request.json();
    } catch {
      return fail("bad_request", "Invalid JSON body", 400);
    }
    if (!b.orderCode) return fail("bad_request", "orderCode is required", 400);
    if (b.listId !== undefined && !Number.isInteger(b.listId)) {
      return fail("bad_request", "listId must be an integer", 400);
    }

    const order = await prisma.attendeeOrder.findFirst({
      where: { eventMappingId: event.id, orderCode: b.orderCode },
    });
    if (!order) return fail("not_found", "Order not found", 404);

    const elig = checkinEligibility(order);
    if (!elig.ok) return fail("not_eligible", elig.reason ?? "Not eligible", 409);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: event.organizationId } });
    const pctx = resolvePretixContext(org);
    const lists = await listCheckinLists(pctx.organizerSlug, event.pretixEventSlug, pctx.token);

    // Same rule as the door screen: pretix tracks redemption PER LIST, so on a
    // multi-day event the first list is only correct on day one. Taking
    // `lists[0]` here meant every caller redeemed against day one forever, and
    // an attendee already scanned in on the 28th is refused as "already
    // redeemed" on the 29th and 30th. An explicit listId still wins, for
    // reconciliation and for callers that manage days themselves.
    let listId: number | undefined;
    if (b.listId !== undefined) {
      if (!lists.some((l) => l.id === b.listId)) {
        return fail("bad_request", `listId ${b.listId} is not a check-in list for this event`, 400);
      }
      listId = b.listId;
    } else {
      const days = await prisma.subEvent.findMany({
        where: { eventMappingId: event.id },
        select: { dateFrom: true },
        orderBy: { dateFrom: "asc" },
      });
      listId =
        selectListIdForDate(days, lists, venueToday(VENUE_IANA_ZONE)) ?? lists[0]?.id;
    }
    if (!listId) return fail("no_checkin_list", "No check-in list configured", 409);

    const redeem = await redeemCheckin(
      pctx.organizerSlug, event.pretixEventSlug, listId,
      order.pretixSecret ?? order.orderCode, pctx.token,
    );
    if (redeem.status !== "ok") return fail("checkin_failed", redeem.reason ?? "Check-in failed", 409);

    const log = await prisma.badgePrintLog.create({
      data: { eventMappingId: event.id, attendeeRef: order.orderCode, reprint: false },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: event.organizationId, actorUserId: null,
        action: "attendee.checked_in", entityType: "order", entityId: order.id,
      },
    });
    return ok(checkinDTO(log), {}, { status: 201 });
  });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
