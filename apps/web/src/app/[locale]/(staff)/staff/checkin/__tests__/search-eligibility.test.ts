import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A search row carries whether the big green button will work.
 *
 * Status and approval are columns on the row the query already returns, and the
 * row showed neither — so "Check in & print" was pressed on a cancelled or
 * unapproved order and the refusal arrived as a red banner with the person
 * standing there.
 */

const { getSessionContext, searchAttendees } = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  searchAttendees: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/checkin/service", () => ({
  searchAttendees,
  checkInOrder: vi.fn(),
  checkInBySecret: vi.fn(),
  reprintBadge: vi.fn(),
  updateAttendeeDetails: vi.fn(),
  getAttendeeForEdit: vi.fn(),
}));
vi.mock("@/lib/staff/walkin", () => ({ createWalkIn: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/events/service", () => ({ getEventForSession: vi.fn() }));
vi.mock("@/lib/pretix/context", () => ({ resolvePretixContext: vi.fn() }));
vi.mock("@/lib/pretix/checkin", () => ({ checkinCounters: vi.fn() }));

import { searchAction } from "../actions";

const row = (over: Record<string, unknown>) => ({
  orderCode: "ABCDE",
  email: "a@b.co",
  attendeeName: "Marven Mouaalem",
  phone: "70123456",
  status: "paid",
  approvalStatus: "not_required",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContext.mockResolvedValue({ userId: "u1", memberships: [] });
});

describe("searchAction marks what can be checked in", () => {
  it("passes an issued registration through as eligible", async () => {
    searchAttendees.mockResolvedValue([row({})]);
    const [found] = await searchAction("evt", "marven");
    expect(found.eligible).toBe(true);
    expect(found.ineligibleReason).toBeUndefined();
  });

  it("names why an unapproved registration cannot be admitted", async () => {
    searchAttendees.mockResolvedValue([row({ status: "pending", approvalStatus: "pending" })]);
    const [found] = await searchAction("evt", "marven");
    expect(found.eligible).toBe(false);
    expect(found.ineligibleReason).toMatch(/approval/i);
  });

  it("names an unpaid one too", async () => {
    searchAttendees.mockResolvedValue([row({ status: "pending" })]);
    const [found] = await searchAction("evt", "marven");
    expect(found.eligible).toBe(false);
    expect(found.ineligibleReason).toMatch(/payment/i);
  });

  it("marks a cancelled registration", async () => {
    searchAttendees.mockResolvedValue([row({ status: "canceled" })]);
    const [found] = await searchAction("evt", "marven");
    expect(found.eligible).toBe(false);
    expect(found.ineligibleReason).toMatch(/cancel/i);
  });

  it("still returns the row rather than hiding it", async () => {
    // Hiding an ineligible person would be worse: they are standing there, and
    // the operator needs to be able to say what is wrong.
    searchAttendees.mockResolvedValue([row({ status: "canceled" })]);
    const found = await searchAction("evt", "marven");
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Marven Mouaalem");
  });
});
