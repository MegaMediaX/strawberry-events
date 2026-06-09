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
 * Hold the requested seats for `holderRef` (10-min expiry). Atomically transitions
 * only seats that are available or whose previous hold has expired. Throws if any
 * requested seat could not be held (already taken).
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
    where: { id: { in: seatIds }, state: "available" },
    data: { state: "temporarily_held", heldUntil, attendeeRef: holderRef },
  });
  if (res.count !== seatIds.length) {
    // Roll back our partial hold and report.
    await prisma.seatAssignment.updateMany({
      where: { id: { in: seatIds }, state: "temporarily_held", attendeeRef: holderRef, heldUntil },
      data: { state: "available", heldUntil: null, attendeeRef: null },
    });
    throw new Error("One or more selected seats are unavailable");
  }
  return { seatIds, heldUntil };
}

/** Confirm held seats as sold/reserved against an order. */
export async function confirmSeats(seatIds: string[], orderCode: string) {
  await prisma.seatAssignment.updateMany({
    where: { id: { in: seatIds }, state: "temporarily_held" },
    data: { state: "sold_or_reserved", attendeeRef: orderCode, heldUntil: null },
  });
}

/** Release all seats held/sold under an order ref back to available. */
export async function releaseSeats(orderCode: string) {
  await prisma.seatAssignment.updateMany({
    where: { attendeeRef: orderCode },
    data: { state: "available", heldUntil: null, attendeeRef: null },
  });
}
