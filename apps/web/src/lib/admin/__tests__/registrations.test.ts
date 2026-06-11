import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findMany: vi.fn(), findUnique: vi.fn() },
    badgePrintLog: { findMany: vi.fn() },
    customFormAnswer: { findMany: vi.fn() },
    seatAssignment: { findFirst: vi.fn() },
    waitlistEntry: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { listRegistrations, buildCsv, getRegistrationDetail, type RegistrationRow } from "@/lib/admin/registrations";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "u", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};

const baseOrder = {
  id: "o1", orderCode: "ABC12", eventMappingId: "e1",
  attendeeName: "Jane", email: "j@x.com", phone: "70", phoneCC: "+961", company: null,
  roleTag: "visitor", provider: "manual_cod", status: "pending", approvalStatus: "not_required",
  totalCents: 2500, pretixSecret: "SEC", createdAt: new Date("2026-01-01"),
  eventMapping: { titleEn: "Expo", organizationId: "orgA", localEventId: "loc1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.attendeeOrder.findMany).mockResolvedValue([baseOrder]);
});

describe("listRegistrations — scope + filters", () => {
  it("super admin is unconstrained", async () => {
    await listRegistrations(sa);
    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({}); // orderScope(super) === {}
  });

  it("organizer_admin is org-scoped via eventMapping", async () => {
    await listRegistrations(orgAdmin);
    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ eventMapping: { OR: [{ organizationId: "orgA" }] } });
  });

  it("applies event + roleTag + search filters", async () => {
    await listRegistrations(orgAdmin, { eventId: "e1", roleTag: "media", q: "jane" });
    const and = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ eventMappingId: "e1" });
    expect(and).toContainEqual({ roleTag: "media" });
    const search = and.find((c: Record<string, unknown>) => "OR" in c);
    expect(search.OR.some((o: Record<string, unknown>) => "email" in o)).toBe(true);
  });

  it("maps rows without exposing secrets", async () => {
    const rows = await listRegistrations(orgAdmin);
    expect(rows[0]).toMatchObject({ orderCode: "ABC12", method: "COD", state: "pending_payment" });
    expect(JSON.stringify(rows[0])).not.toContain("SEC");
  });
});

describe("buildCsv", () => {
  it("emits a header + one row, escaping commas", () => {
    const rows: RegistrationRow[] = [{
      id: "o1", orderCode: "ABC12", event: "Expo, 2026", eventId: "e1", attendee: "Jane",
      email: "j@x.com", phone: "70", company: null, roleTag: "visitor", method: "COD",
      status: "pending", approvalStatus: "not_required", state: "pending_payment", createdAt: new Date("2026-01-01T00:00:00Z"),
    }];
    const csv = buildCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Event");
    expect(lines[1]).toContain('"Expo, 2026"');
    expect(lines[1]).toContain("ABC12");
  });
});

describe("getRegistrationDetail — access + QR gating", () => {
  beforeEach(() => {
    mock(prisma.customFormAnswer.findMany).mockResolvedValue([]);
    mock(prisma.seatAssignment.findFirst).mockResolvedValue(null);
    mock(prisma.waitlistEntry.findMany).mockResolvedValue([]);
    mock(prisma.badgePrintLog.findMany).mockResolvedValue([]);
    mock(prisma.auditLog.findMany).mockResolvedValue([]);
  });

  it("denies access to another org's registration", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({
      ...baseOrder, eventMapping: { organizationId: "orgB", localEventId: "loc9" },
    });
    await expect(getRegistrationDetail(orgAdmin, "o1")).rejects.toThrow();
  });

  it("hides QR when not issued (pending payment)", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ ...baseOrder, status: "pending" });
    const d = await getRegistrationDetail(orgAdmin, "o1");
    expect(d.qrValue).toBeNull();
  });

  it("exposes QR only when issued", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ ...baseOrder, status: "paid", approvalStatus: "not_required" });
    const d = await getRegistrationDetail(orgAdmin, "o1");
    expect(d.qrValue).toBe("SEC");
  });
});
