import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn() },
    attendeeOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    badgePrintLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/pretix/checkin", () => ({
  redeemCheckin: vi.fn().mockResolvedValue({ status: "ok" }),
  checkinCounters: vi.fn().mockResolvedValue({ total: 10, checkedIn: 3 }),
}));

import { prisma } from "@/lib/db/client";
import * as pretixCheckin from "@/lib/pretix/checkin";
import {
  checkInOrder,
  checkInBySecret,
  reprintBadge,
  searchAttendees,
  NAME_SIMILARITY_THRESHOLD,
} from "@/lib/checkin/service";

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
  // clearAllMocks() resets call history but NOT implementations, so re-assert
  // the happy-path redeem to keep tests isolated from the duplicate-case test.
  mock(pretixCheckin.redeemCheckin).mockResolvedValue({ status: "ok" });
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

/**
 * Flatten the interpolated values of a tagged-template $queryRaw call,
 * descending into nested Prisma.sql fragments (e.g. the optional phone clause).
 */
function rawValues(callIndex = 0): unknown[] {
  const call = mock(prisma.$queryRaw).mock.calls[callIndex];
  const out: unknown[] = [];
  const visit = (vals: unknown[]) => {
    for (const v of vals) {
      if (v && typeof v === "object" && Array.isArray((v as { values?: unknown[] }).values)) {
        visit((v as { values: unknown[] }).values);
      } else {
        out.push(v);
      }
    }
  };
  visit(call.slice(1));
  return out;
}

describe("checkInBySecret (camera scan)", () => {
  it("resolves by pretixSecret → redeem + badge", async () => {
    const res = await checkInBySecret(staff, "e1", "SEC1", 5);
    expect(res.ok).toBe(true);
    expect(prisma.attendeeOrder.findFirst).toHaveBeenCalledWith({
      where: { eventMappingId: "e1", pretixSecret: "SEC1" },
    });
    expect(pretixCheckin.redeemCheckin).toHaveBeenCalled();
  });

  it("unknown QR → not recognized, no redeem", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    const res = await checkInBySecret(staff, "e1", "NOPE", 5);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not recognized/i);
    expect(pretixCheckin.redeemCheckin).not.toHaveBeenCalled();
  });

  it("empty QR → rejected", async () => {
    const res = await checkInBySecret(staff, "e1", "   ", 5);
    expect(res.ok).toBe(false);
    expect(prisma.attendeeOrder.findFirst).not.toHaveBeenCalled();
  });

  it("finance cannot scan-check-in", async () => {
    await expect(checkInBySecret(finance, "e1", "SEC1", 5)).rejects.toThrow();
  });
});

describe("reprintBadge", () => {
  it("issued order → reprint logged, NO pretix redeem", async () => {
    const res = await reprintBadge(staff, "e1", "ABC12");
    expect(res.ok).toBe(true);
    expect(pretixCheckin.redeemCheckin).not.toHaveBeenCalled();
    expect(prisma.badgePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reprint: true }) }),
    );
  });

  it("ineligible (pending payment) → no reprint", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(
      order({ status: "pending", approvalStatus: "not_required" }),
    );
    const res = await reprintBadge(staff, "e1", "ABC12");
    expect(res.ok).toBe(false);
    expect(prisma.badgePrintLog.create).not.toHaveBeenCalled();
  });

  it("finance cannot reprint", async () => {
    await expect(reprintBadge(finance, "e1", "ABC12")).rejects.toThrow();
  });
});

describe("searchAttendees (fuzzy)", () => {
  beforeEach(() => mock(prisma.$queryRaw).mockResolvedValue([order()]));

  it("finance role cannot search attendees (PII exposure)", async () => {
    await expect(searchAttendees(finance, "e1", "abc")).rejects.toThrow();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("impersonating session cannot search attendees", async () => {
    await expect(
      searchAttendees({ ...staff, impersonating: true }, "e1", "abc"),
    ).rejects.toThrow();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("checkin_staff can search attendees", async () => {
    const res = await searchAttendees(staff, "e1", "abc");
    expect(res).toEqual([order()]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("organizer_admin can search attendees", async () => {
    const orgAdmin: SessionContext = {
      userId: "a1",
      isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
    };
    const res = await searchAttendees(orgAdmin, "e1", "abc");
    expect(res).toEqual([order()]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("scopes the query to the resolved event mapping", async () => {
    await searchAttendees(staff, "e1", "mohamad");
    expect(rawValues()).toContain("e1");
  });

  it("passes a name LIKE pattern and the similarity threshold for typo matching", async () => {
    await searchAttendees(staff, "e1", "mohamad");
    const values = rawValues();
    expect(values).toContain("%mohamad%"); // substring branch
    expect(values).toContain(NAME_SIMILARITY_THRESHOLD); // word_similarity branch ("mouhamad")
  });

  it("digit-normalizes a phone query", async () => {
    await searchAttendees(staff, "e1", "+961 70 123 456");
    expect(rawValues()).toContain("%96170123456%");
  });

  it("omits the phone clause for short/no-digit queries", async () => {
    await searchAttendees(staff, "e1", "jo");
    const hasPhonePattern = rawValues().some(
      (v) => typeof v === "string" && /%\d{3,}%/.test(v),
    );
    expect(hasPhonePattern).toBe(false);
  });
});
