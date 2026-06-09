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
  it("holds all requested seats when available", async () => {
    // first call = releaseExpiredHolds, second = the hold updateMany
    mock(prisma.seatAssignment.updateMany)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });
    const res = await holdSeats("e1", ["s1", "s2"], "holderX");
    expect(res.heldUntil).toBeInstanceOf(Date);
    const holdArg = mock(prisma.seatAssignment.updateMany).mock.calls[1][0];
    expect(holdArg.data.state).toBe("temporarily_held");
    expect(holdArg.data.attendeeRef).toBe("holderX");
  });

  it("throws when a seat is already taken (count < requested)", async () => {
    mock(prisma.seatAssignment.updateMany)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await expect(holdSeats("e1", ["s1", "s2"], "holderX")).rejects.toThrow(/unavailable/i);
  });
});

describe("confirmSeats", () => {
  it("marks held seats sold with the order ref", async () => {
    mock(prisma.seatAssignment.updateMany).mockResolvedValue({ count: 2 });
    await confirmSeats(["s1", "s2"], "ABC12");
    const arg = mock(prisma.seatAssignment.updateMany).mock.calls[0][0];
    expect(arg.data.state).toBe("sold_or_reserved");
    expect(arg.data.attendeeRef).toBe("ABC12");
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
