import { prisma } from "@/lib/db/client";
import { HOLD_MS } from "./state";

/** Release any expired temporary holds for an event back to available. */
export async function releaseExpiredHolds(eventMappingId: string, now: Date = new Date()) {
  await prisma.seatAssignment.updateMany({
    where: {
      state: "temporarily_held",
      heldUntil: { lt: now },
      row: { section: { seatMap: { eventMappingId } } },
    },
    data: { state: "available", heldUntil: null, attendeeRef: null },
  });
}

/** Load the seat map (sections → rows → seats) after releasing expired holds. */
export async function getSeatMap(eventMappingId: string) {
  await releaseExpiredHolds(eventMappingId);
  return prisma.seatMap.findMany({
    where: { eventMappingId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          rows: {
            orderBy: { sortOrder: "asc" },
            include: { seats: { orderBy: { label: "asc" } } },
          },
        },
      },
    },
  });
}

/**
 * Hold the requested seats for `holderRef` (10-min expiry). Atomic compare-and-set:
 * only seats that belong to THIS event and are currently available/accessible are
 * transitioned, so two concurrent holders cannot both claim the same seat. Throws
 * if any requested seat could not be held (taken, blocked, or not in this event).
 *
 * Note: `accessible` seats are bookable; a released/expired hold returns the seat
 * to `available` (the accessible designation is not preserved across a hold cycle —
 * a documented limitation of the single-state enum).
 */
export async function holdSeats(
  eventMappingId: string,
  seatIds: string[],
  holderRef: string,
  now: Date = new Date(),
) {
  await releaseExpiredHolds(eventMappingId, now);
  const heldUntil = new Date(now.getTime() + HOLD_MS);
  const res = await prisma.seatAssignment.updateMany({
    where: {
      id: { in: seatIds },
      state: { in: ["available", "accessible"] },
      row: { section: { seatMap: { eventMappingId } } },
    },
    data: { state: "temporarily_held", heldUntil, attendeeRef: holderRef },
  });
  if (res.count !== seatIds.length) {
    // Roll back only OUR partial hold (scoped by holder, not by exact timestamp).
    await prisma.seatAssignment.updateMany({
      where: { attendeeRef: holderRef, state: "temporarily_held", heldUntil },
      data: { state: "available", heldUntil: null, attendeeRef: null },
    });
    throw new Error("One or more selected seats are unavailable");
  }
  return { seatIds, heldUntil };
}

/**
 * Confirm seats as sold/reserved against an order — HOLDER-SCOPED: only seats
 * currently held by this order (`attendeeRef === orderCode`) are confirmed, so an
 * order can never confirm another holder's seat. Throws if any aren't held by it
 * (e.g. the hold expired meanwhile).
 */
export async function confirmSeats(seatIds: string[], orderCode: string) {
  const res = await prisma.seatAssignment.updateMany({
    where: { id: { in: seatIds }, state: "temporarily_held", attendeeRef: orderCode },
    data: { state: "sold_or_reserved", heldUntil: null },
  });
  if (res.count !== seatIds.length) {
    throw new Error("Seat hold expired or seats are not held by this order");
  }
}

/** Release all seats held/sold under an order ref back to available (on cancel/reject). */
export async function releaseSeats(orderCode: string) {
  await prisma.seatAssignment.updateMany({
    where: { attendeeRef: orderCode },
    data: { state: "available", heldUntil: null, attendeeRef: null },
  });
}
