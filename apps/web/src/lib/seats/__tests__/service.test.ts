import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    seatAssignment: { updateMany: vi.fn(), findMany: vi.fn() },
    seatMap: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { holdSeats, confirmSeats, releaseSeats, releaseExpiredHolds } from "@/lib/seats/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("releaseExpiredHolds", () => {
  it("flips expired holds back to available", async () => {
    mock(prisma.seatAssignment.updateMany).mockResolvedValue({ count: 2 });
    await releaseExpiredHolds("e1");
    const arg = mock(prisma.seatAssignment.updateMany).mock.calls[0][0];
    expect(arg.where.state).toBe("temporarily_held");
    expect(arg.where.heldUntil.lt).toBeInstanceOf(Date);
    expect(arg.data.state).toBe("available");
  });
});

describe("holdSeats", () => {
  it("holds available/accessible seats scoped to the event", async () => {
    mock(prisma.seatAssignment.updateMany)
      .mockResolvedValueOnce({ count: 0 }) // releaseExpiredHolds
      .mockResolvedValueOnce({ count: 2 }); // hold
    const res = await holdSeats("e1", ["s1", "s2"], "holderX");
    expect(res.heldUntil).toBeInstanceOf(Date);
    const holdArg = mock(prisma.seatAssignment.updateMany).mock.calls[1][0];
    expect(holdArg.where.state).toEqual({ in: ["available", "accessible"] });
    // seat ids must belong to this event
    expect(holdArg.where.row.section.seatMap.eventMappingId).toBe("e1");
    expect(holdArg.data.state).toBe("temporarily_held");
    expect(holdArg.data.attendeeRef).toBe("holderX");
  });

  it("throws when a seat is already taken (count < requested) and rolls back by holder", async () => {
    mock(prisma.seatAssignment.updateMany)
      .mockResolvedValueOnce({ count: 0 }) // release expired
      .mockResolvedValueOnce({ count: 1 }) // hold (only 1 of 2)
      .mockResolvedValueOnce({ count: 1 }); // rollback
    await expect(holdSeats("e1", ["s1", "s2"], "holderX")).rejects.toThrow(/unavailable/i);
    const rollback = mock(prisma.seatAssignment.updateMany).mock.calls[2][0];
    expect(rollback.where.attendeeRef).toBe("holderX");
  });
});

describe("confirmSeats (holder-scoped)", () => {
  it("confirms only seats held by this order", async () => {
    mock(prisma.seatAssignment.updateMany).mockResolvedValue({ count: 2 });
    await confirmSeats(["s1", "s2"], "ABC12");
    const arg = mock(prisma.seatAssignment.updateMany).mock.calls[0][0];
    expect(arg.where.state).toBe("temporarily_held");
    expect(arg.where.attendeeRef).toBe("ABC12"); // wrong holder cannot confirm
    expect(arg.data.state).toBe("sold_or_reserved");
  });

  it("throws when the seats are not held by this order (e.g. hold expired / different holder)", async () => {
    mock(prisma.seatAssignment.updateMany).mockResolvedValue({ count: 0 });
    await expect(confirmSeats(["s1", "s2"], "ABC12")).rejects.toThrow(/not held|expired/i);
  });
});

describe("releaseSeats", () => {
  it("frees seats for an order back to available", async () => {
    mock(prisma.seatAssignment.updateMany).mockResolvedValue({ count: 2 });
    await releaseSeats("ABC12");
    const arg = mock(prisma.seatAssignment.updateMany).mock.calls[0][0];
    expect(arg.where.attendeeRef).toBe("ABC12");
    expect(arg.data.state).toBe("available");
    expect(arg.data.heldUntil).toBeNull();
  });
});
