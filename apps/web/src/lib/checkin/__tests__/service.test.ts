import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn() },
    attendeeOrder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
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
  liveCounters,
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
  // A successful check-in mints the badge slug that the printed contact QR
  // resolves to. Default to "this row had none, the write won".
  mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 1 });
  mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ badgeSlug: null });
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

describe("liveCounters", () => {
  it("finance role cannot read live counters (canAccessEvent alone would allow it)", async () => {
    await expect(liveCounters(finance, "e1", 5)).rejects.toThrow();
    expect(pretixCheckin.checkinCounters).not.toHaveBeenCalled();
  });

  it("impersonating session cannot read live counters", async () => {
    await expect(
      liveCounters({ ...staff, impersonating: true }, "e1", 5),
    ).rejects.toThrow();
    expect(pretixCheckin.checkinCounters).not.toHaveBeenCalled();
  });

  it("staff not assigned to the event → denied", async () => {
    const otherStaff: SessionContext = {
      userId: "s2", isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["locX"] }],
    };
    await expect(liveCounters(otherStaff, "e1", 5)).rejects.toThrow();
    expect(pretixCheckin.checkinCounters).not.toHaveBeenCalled();
  });

  it("checkin_staff reads counters from pretix", async () => {
    const res = await liveCounters(staff, "e1", 5);
    expect(res).toEqual({ total: 10, checkedIn: 3 });
    expect(pretixCheckin.checkinCounters).toHaveBeenCalledWith("acme", "expo", 5, "env_tok");
  });

  it("organizer_admin reads counters", async () => {
    const orgAdmin: SessionContext = {
      userId: "a1",
      isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
    };
    const res = await liveCounters(orgAdmin, "e1", 5);
    expect(res).toEqual({ total: 10, checkedIn: 3 });
  });
});

describe("badge slug assignment", () => {
  it("mints a slug on a successful check-in", async () => {
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Guarded on null: the write must not rotate a slug already printed
        // onto a badge someone is wearing.
        where: expect.objectContaining({ badgeSlug: null }),
      }),
    );
    expect(res.badge?.badgeSlug).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("keeps the slug an order already has", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ badgeSlug: "KEEPTHIS" }));
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.badge?.badgeSlug).toBe("KEEPTHIS");
    // No write at all — rotating this would 404 a badge already in the wild.
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });

  it("takes the winner's slug when a concurrent print got there first", async () => {
    mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 0 });
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ badgeSlug: "WONRACE1" });
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.badge?.badgeSlug).toBe("WONRACE1");
  });

  it("still checks in when the slug cannot be assigned", async () => {
    // A QR is a decoration; entry is not. Losing the slug must never turn into
    // a refused attendee at the door.
    mock(prisma.attendeeOrder.updateMany).mockRejectedValue(new Error("unique violation"));
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ badgeSlug: null });
    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    expect(res.badge?.badgeSlug).toBeNull();
  });
});

describe("the slug must never cost someone entry", () => {
  // These are the cases the original "still checks in when the slug cannot be
  // assigned" test could not catch: it rejected updateMany while leaving
  // findUnique healthy, so it passed whether or not the re-read was guarded.
  // The re-read was NOT guarded, and it runs AFTER pretix has already redeemed.

  it("checks in when the re-read throws", async () => {
    mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 0 });
    mock(prisma.attendeeOrder.findUnique).mockRejectedValue(new Error("connection reset"));

    const res = await checkInOrder(staff, "e1", "ABC12", 5);

    // pretix already redeemed by this point. Reporting a failure here would
    // send staff to re-scan, pretix would answer "already redeemed", and a
    // paying attendee would be stuck at the door with no badge.
    expect(res.ok).toBe(true);
    expect(res.badge?.badgeSlug).toBeNull();
    expect(pretixCheckin.redeemCheckin).toHaveBeenCalled();
  });

  it("checks in when the column does not exist yet", async () => {
    // The deploy window: CI recreates the container before running migrations,
    // so new code briefly runs against the old schema.
    const missingColumn = Object.assign(new Error('column "badgeSlug" does not exist'), {
      code: "P2022",
    });
    mock(prisma.attendeeOrder.updateMany).mockRejectedValue(missingColumn);
    mock(prisma.attendeeOrder.findUnique).mockRejectedValue(missingColumn);

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    expect(res.badge?.badgeSlug).toBeNull();
  });

  it("does not treat a non-collision error as a lost race", async () => {
    // A missing column or dead connection is not "someone else won". Retrying
    // it as though it were hides a real outage behind a merely-absent QR.
    const dead = Object.assign(new Error("connection reset"), { code: "P1001" });
    mock(prisma.attendeeOrder.updateMany).mockRejectedValue(dead);
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ badgeSlug: null });

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    // Bailed on the first error rather than burning all three attempts.
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalledTimes(1);
  });

  it("retries a genuine unique collision", async () => {
    const collision = Object.assign(new Error("unique"), { code: "P2002" });
    mock(prisma.attendeeOrder.updateMany)
      .mockRejectedValueOnce(collision)
      .mockResolvedValue({ count: 1 });
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ badgeSlug: null });

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(true);
    expect(res.badge?.badgeSlug).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("already checked in", () => {
  it("names the attendee so the door can offer a reprint", async () => {
    // Without this the door sees only "already redeemed" and cannot act: the
    // common cause is a lost or torn badge, and staff need to know WHO.
    mock(pretixCheckin.redeemCheckin).mockResolvedValue({
      status: "error",
      reason: "Ticket already redeemed",
    });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(
      order({ attendeeName: "Salwa Eid" }),
    );

    const res = await checkInOrder(staff, "e1", "ABC12", 5);

    expect(res.ok).toBe(false);
    expect(res.alreadyCheckedIn).toEqual({ orderCode: "ABC12", fullName: "Salwa Eid" });
  });

  it("falls back to the email when there is no name", async () => {
    mock(pretixCheckin.redeemCheckin).mockResolvedValue({
      status: "error",
      reason: "already redeemed",
    });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ attendeeName: null }));

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.alreadyCheckedIn?.fullName).toBe("a@b.com");
  });

  it("does NOT offer a reprint for other refusals", async () => {
    // A genuinely failed check-in must not turn into a badge. Only the
    // already-redeemed case is a lost-badge situation.
    mock(pretixCheckin.redeemCheckin).mockResolvedValue({
      status: "error",
      reason: "Ticket is not valid for this list",
    });

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.ok).toBe(false);
    expect(res.alreadyCheckedIn).toBeUndefined();
  });

  it("never returns a badge on refusal, so nothing prints automatically", async () => {
    // handleResult prints on `ok && badge`. Attaching a badge here would print
    // a second badge for someone already inside without anyone confirming.
    mock(pretixCheckin.redeemCheckin).mockResolvedValue({
      status: "error",
      reason: "Ticket already redeemed",
    });

    const res = await checkInOrder(staff, "e1", "ABC12", 5);
    expect(res.badge).toBeUndefined();
  });

  it("reprinting does not redeem in pretix a second time", async () => {
    // The whole point: a reprint is a new label, not a new check-in.
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order());
    const res = await reprintBadge(staff, "e1", "ABC12");

    expect(res.ok).toBe(true);
    expect(pretixCheckin.redeemCheckin).not.toHaveBeenCalled();
    const log = mock(prisma.badgePrintLog.create).mock.calls[0][0];
    expect(log.data).toMatchObject({ reprint: true });
  });
});
