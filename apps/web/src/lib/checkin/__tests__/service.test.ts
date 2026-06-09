import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn() },
    attendeeOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    badgePrintLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/checkin", () => ({
  redeemCheckin: vi.fn().mockResolvedValue({ status: "ok" }),
  checkinCounters: vi.fn().mockResolvedValue({ total: 10, checkedIn: 3 }),
}));

import { prisma } from "@/lib/db/client";
import * as pretixCheckin from "@/lib/pretix/checkin";
import { checkInOrder } from "@/lib/checkin/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const staff: SessionContext = {
  userId: "s1",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1"] }],
};
const finance: SessionContext = {
  userId: "f1",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const mapping = {
  id: "e1",
  organizationId: "orgA",
  localEventId: "loc1",
  pretixOrganizerSlug: "acme",
  pretixEventSlug: "expo",
  titleEn: "Expo",
};

function order(overrides = {}) {
  return {
    id: "o1",
    orderCode: "ABC12",
    email: "a@b.com",
    status: "paid",
    approvalStatus: "not_required",
    roleTag: "media",
    pretixSecret: "SEC1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  mock(prisma.eventMapping.findUnique).mockResolvedValue(mapping);
  mock(prisma.organization.findUnique).mockResolvedValue({
    id: "orgA", pretixOrganizerSlug: "acme", pretixApiToken: null,
  });
  mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order());
});

describe("checkInOrder", () => {
  it("issued order → redeem + badge log + audit", async () => {
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    expect(pretixCheckin.redeemCheckin).toHaveBeenCalledWith("acme", "expo", 5, "SEC1", "env_tok");
    expect(prisma.badgePrintLog.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("ineligible (pending payment) → rejected, no redeem", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(
      order({ status: "pending", approvalStatus: "not_required" }),
    );
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/payment/i);
    expect(pretixCheckin.redeemCheckin).not.toHaveBeenCalled();
  });

  it("finance cannot check in", async () => {
    await expect(checkInOrder(finance, "e1", "ABC12", 5)).rejects.toThrow();
  });

  it("impersonating cannot check in", async () => {
    await expect(checkInOrder({ ...staff, impersonating: true }, "e1", "ABC12", 5)).rejects.toThrow();
  });

  it("staff not assigned to the event → denied", async () => {
    const otherStaff: SessionContext = {
      userId: "s2", isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["locX"] }],
    };
    await expect(checkInOrder(otherStaff, "e1", "ABC12", 5)).rejects.toThrow();
  });

  it("surfaces a duplicate (pretix already redeemed)", async () => {
    mock(pretixCheckin.redeemCheckin).mockResolvedValue({ status: "error", reason: "already_redeemed" });
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/already/i);
  });
});
