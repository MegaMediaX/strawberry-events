import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { count: vi.fn(), findMany: vi.fn() },
    attendeeOrder: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    badgePrintLog: { count: vi.fn(), findMany: vi.fn() },
    waitlistEntry: { count: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { getDashboard } from "@/lib/admin/dashboard";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "u", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1"] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.eventMapping.count).mockResolvedValue(5);
  mock(prisma.eventMapping.findMany).mockResolvedValue([]);
  mock(prisma.attendeeOrder.count).mockResolvedValue(3);
  mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
  mock(prisma.attendeeOrder.aggregate).mockResolvedValue({ _sum: { totalCents: 1000 } });
  mock(prisma.attendeeOrder.groupBy).mockResolvedValue([]);
  mock(prisma.badgePrintLog.count).mockResolvedValue(2);
  mock(prisma.badgePrintLog.findMany).mockResolvedValue([]);
  mock(prisma.waitlistEntry.count).mockResolvedValue(4);
  mock(prisma.auditLog.findMany).mockResolvedValue([]);
});

describe("getDashboard — KPI wiring + role", () => {
  it("assembles KPIs from scoped counts for super admin", async () => {
    const d = await getDashboard(sa);
    expect(d.viewerRole).toBe("super_admin");
    expect(d.kpis.totalEvents).toBe(5);
    expect(d.kpis.totalRegistrations).toBe(3);
    expect(d.kpis.checkedIn).toBe(2);
    expect(d.kpis.waitlist).toBe(4);
    expect(d.kpis.codPendingCents).toBe(1000);
    expect(d.sections).toEqual({ financial: true, checkins: true, audit: true, waitlist: true });
    // super admin is unconstrained
    expect(mock(prisma.attendeeOrder.count).mock.calls[0][0].where).toEqual({});
  });
});

describe("getDashboard — org isolation", () => {
  it("scopes organizer_admin order counts to their org's events", async () => {
    await getDashboard(orgAdmin);
    expect(mock(prisma.attendeeOrder.count).mock.calls[0][0].where).toEqual({
      eventMapping: { OR: [{ organizationId: "orgA" }] },
    });
    expect(mock(prisma.auditLog.findMany).mock.calls[0][0].where).toEqual({
      organizationId: { in: ["orgA"] },
    });
  });

  it("scopes checkin_staff event counts to assigned events only", async () => {
    await getDashboard(staff);
    expect(mock(prisma.eventMapping.count).mock.calls[0][0].where).toEqual({
      OR: [{ organizationId: "orgA", localEventId: { in: ["loc1"] } }],
    });
  });
});

describe("getDashboard — role-safe sections", () => {
  it("finance sees financial but not audit/check-in sections", async () => {
    const d = await getDashboard(finance);
    expect(d.viewerRole).toBe("finance");
    expect(d.sections).toEqual({ financial: true, checkins: false, audit: false, waitlist: false });
  });

  it("check-in staff sees check-in summary but not financial/audit", async () => {
    const d = await getDashboard(staff);
    expect(d.viewerRole).toBe("checkin_staff");
    expect(d.sections.financial).toBe(false);
    expect(d.sections.checkins).toBe(true);
    expect(d.sections.audit).toBe(false);
  });
});
