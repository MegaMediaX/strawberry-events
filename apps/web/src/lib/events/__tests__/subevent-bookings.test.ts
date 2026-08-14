import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findFirst: vi.fn(), findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    subEvent: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/context", () => ({
  resolvePretixContext: () => ({ organizerSlug: "acme", token: "tok" }),
}));
vi.mock("@/lib/pretix/products", () => ({ quotaBookings: vi.fn() }));

import { prisma } from "@/lib/db/client";
import * as pretixProducts from "@/lib/pretix/products";
import { listSubEventBookings } from "@/lib/events/service";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const admin: SessionContext = {
  userId: "u1",
  isSuperAdmin: true,
  memberships: [],
};

const sub = (o: Partial<Record<string, unknown>> = {}) => ({
  id: "s1",
  titleEn: "Day One",
  category: "DAYS",
  location: "Le Royal",
  dateFrom: new Date("2026-08-28T09:30:00.000Z"),
  dateTo: new Date("2026-08-28T18:00:00.000Z"),
  maxAttendees: null,
  pretixQuotaId: 5,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  m(prisma.eventMapping.findUnique).mockResolvedValue({
    id: "e1",
    organizationId: "orgA",
    pretixEventSlug: "expo",
    localEventId: "loc1",
  });
  m(prisma.organization.findUnique).mockResolvedValue({ id: "orgA" });
});

describe("listSubEventBookings", () => {
  it("reports booked counts for an UNCAPPED session", async () => {
    // The case the bulk quota list cannot serve: size and available_number are
    // both null, but paid_orders is the number an organiser needs.
    m(prisma.subEvent.findMany).mockResolvedValue([sub()]);
    m(pretixProducts.quotaBookings).mockResolvedValue({
      paid_orders: 432,
      pending_orders: 0,
      cart_positions: 0,
      waiting_list: 0,
      available_number: null,
      total_size: null,
      available: true,
    });

    const [row] = await listSubEventBookings(admin, "e1");
    expect(row.booked).toBe(432);
    expect(row.capacity).toBeNull();
    expect(row.remaining).toBeNull();
    expect(row.error).toBeNull();
  });

  it("reports capacity and remaining for a capped session", async () => {
    m(prisma.subEvent.findMany).mockResolvedValue([sub({ maxAttendees: 80, pretixQuotaId: 11 })]);
    m(pretixProducts.quotaBookings).mockResolvedValue({
      paid_orders: 71,
      pending_orders: 2,
      cart_positions: 1,
      waiting_list: 0,
      available_number: 9,
      total_size: 80,
      available: true,
    });

    const [row] = await listSubEventBookings(admin, "e1");
    expect(row.booked).toBe(71);
    expect(row.capacity).toBe(80);
    expect(row.remaining).toBe(9);
    expect(row.pending).toBe(3); // pending orders + carts, both hold a seat
  });

  it("reports pretix's cap, not the local one, when they disagree", async () => {
    m(prisma.subEvent.findMany).mockResolvedValue([sub({ maxAttendees: 80 })]);
    m(pretixProducts.quotaBookings).mockResolvedValue({
      paid_orders: 10,
      pending_orders: 0,
      cart_positions: 0,
      waiting_list: 0,
      available_number: 40,
      total_size: 50,
      available: true,
    });

    const [row] = await listSubEventBookings(admin, "e1");
    expect(row.capacity).toBe(50);
  });

  it("reports UNCAPPED when pretix is uncapped, even if a local cap is set", async () => {
    // The misleading case: a local maxAttendees that pretix does not enforce.
    // Showing it would paint a fill bar and a percentage for a ceiling pretix
    // will sell straight through, while Remaining sat at "—" in the same row.
    m(prisma.subEvent.findMany).mockResolvedValue([sub({ maxAttendees: 80 })]);
    m(pretixProducts.quotaBookings).mockResolvedValue({
      paid_orders: 120,
      pending_orders: 0,
      cart_positions: 0,
      waiting_list: 0,
      available_number: null,
      total_size: null,
      available: true,
    });

    const [row] = await listSubEventBookings(admin, "e1");
    expect(row.capacity).toBeNull();
    expect(row.booked).toBe(120);
  });

  it("still lists every session when pretix credentials cannot be resolved", async () => {
    // Throws BEFORE the per-row map. Previously this blanked the entire page,
    // which defeated the point of isolating rows at all.
    m(prisma.subEvent.findMany).mockResolvedValue([sub({ id: "a" }), sub({ id: "b" })]);
    m(prisma.organization.findUnique).mockResolvedValue(null);

    const rows = await listSubEventBookings(admin, "e1");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.booked === null && r.error)).toBe(true);
    expect(pretixProducts.quotaBookings).not.toHaveBeenCalled();
  });

  it("isolates a failing session instead of blanking the page", async () => {
    // A half-finished delete has left an unreadable quota in this system before.
    // One broken session must not take the whole view down.
    m(prisma.subEvent.findMany).mockResolvedValue([
      sub({ id: "ok", titleEn: "Day One", pretixQuotaId: 5 }),
      sub({ id: "broken", titleEn: "Ghost", pretixQuotaId: 9 }),
    ]);
    m(pretixProducts.quotaBookings).mockImplementation(async (_o, _e, quotaId) => {
      if (quotaId === 9) throw new Error("pretix API error 404 for /quotas/9/");
      return {
        paid_orders: 5,
        pending_orders: 0,
        cart_positions: 0,
        waiting_list: 0,
        available_number: null,
        total_size: null,
        available: true,
      };
    });

    const rows = await listSubEventBookings(admin, "e1");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "ok")?.booked).toBe(5);
    const broken = rows.find((r) => r.id === "broken");
    expect(broken?.booked).toBeNull();
    // Sanitised: the raw message embeds the internal pretix URL.
    expect(broken?.error).toBe("figures unavailable");
    expect(broken?.error).not.toMatch(/http/);
  });

  it("handles a session with no quota linked at all", async () => {
    m(prisma.subEvent.findMany).mockResolvedValue([sub({ pretixQuotaId: null })]);
    const [row] = await listSubEventBookings(admin, "e1");
    expect(row.booked).toBeNull();
    expect(row.error).toMatch(/pretix quota/i);
    expect(pretixProducts.quotaBookings).not.toHaveBeenCalled();
  });

  it("refuses an event the session cannot access", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue(null);
    await expect(listSubEventBookings(admin, "nope")).rejects.toThrow(/not found|access denied/i);
  });
});
