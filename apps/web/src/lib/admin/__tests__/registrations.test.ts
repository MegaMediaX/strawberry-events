import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/pretix/context", () => ({ resolvePretixContext: vi.fn() }));
vi.mock("@/lib/pretix/orders", () => ({ listOrders: vi.fn(), getOrder: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    subEvent: { findUnique: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    badgePrintLog: { findMany: vi.fn() },
    customFormAnswer: { findMany: vi.fn() },
    seatAssignment: { findFirst: vi.fn() },
    waitlistEntry: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listOrders } from "@/lib/pretix/orders";
import { listRegistrations, listRegistrationsPage, buildCsv, getRegistrationDetail, type RegistrationRow } from "@/lib/admin/registrations";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "u", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};

const baseOrder = {
  id: "o1", orderCode: "ABC12", eventMappingId: "e1",
  attendeeName: "Jane", email: "j@x.com", phone: "70", phoneCC: "+961", company: null, jobTitle: null,
  roleTag: "visitor", provider: "manual_cod", status: "pending", approvalStatus: "not_required",
  totalCents: 2500, pretixSecret: "SEC", createdAt: new Date("2026-01-01"),
  eventMapping: { titleEn: "Expo", organizationId: "orgA", localEventId: "loc1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.attendeeOrder.findMany).mockResolvedValue([baseOrder]);
  mock(prisma.attendeeOrder.count).mockResolvedValue(1);
});

describe("workshop organiser scoping", () => {
  const scoped = {
    userId: "wo1",
    isSuperAdmin: false,
    memberships: [
      {
        organizationId: "orgA",
        role: "workshop_organiser" as const,
        assignedEventIds: ["loc1"],
        assignedSubEventIds: ["se1", "se2"],
      },
    ],
  };

  const twoSessions = [
    { id: "se1", pretixItemId: 9, eventMapping: { id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo" } },
    { id: "se2", pretixItemId: 11, eventMapping: { id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo" } },
  ];

  it("sees ALL assigned sessions when none is chosen, not just the first", async () => {
    mock(prisma.subEvent.findMany).mockResolvedValue(twoSessions);
    mock(prisma.organization.findUnique).mockResolvedValue({ id: "orgA" });
    mock(resolvePretixContext).mockReturnValue({ organizerSlug: "acme", token: "t" });
    mock(listOrders).mockResolvedValue([
      { code: "IN_SE1", status: "p", positions: [{ item: 9, canceled: false }] },
      { code: "IN_SE2", status: "p", positions: [{ item: 11, canceled: false }] },
      { code: "OTHER", status: "p", positions: [{ item: 5, canceled: false }] },
    ]);
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);

    await listRegistrationsPage(scoped, {});

    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    const clause = (where.AND as Record<string, unknown>[])
      .map((c) => (c as { orderCode?: { in?: string[] } }).orderCode?.in)
      .filter(Boolean)
      .pop();
    expect(clause?.sort()).toEqual(["IN_SE1", "IN_SE2"]);
  });

  it("still applies the checkedIn filter when showing all their sessions", async () => {
    // This branch used to return early, skipping the checkedIn pass entirely —
    // an organiser filtering "checked in" silently got everyone, on screen and
    // in the CSV.
    mock(prisma.subEvent.findMany).mockResolvedValue(twoSessions);
    mock(prisma.organization.findUnique).mockResolvedValue({ id: "orgA" });
    mock(resolvePretixContext).mockReturnValue({ organizerSlug: "acme", token: "t" });
    mock(listOrders).mockResolvedValue([
      { code: "IN_SE1", status: "p", positions: [{ item: 9, canceled: false }] },
    ]);
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);
    mock(prisma.badgePrintLog.findMany).mockResolvedValue([]);

    await listRegistrationsPage(scoped, { checkedIn: true });

    expect(prisma.badgePrintLog.findMany).toHaveBeenCalled();
  });

  it("refuses a session outside the assignment", async () => {
    await expect(
      listRegistrationsPage(scoped, { subEventId: "se-not-mine" }),
    ).rejects.toThrow();
  });

  it("returns nothing when restricted but assigned no sessions", async () => {
    const none = { ...scoped, memberships: [{ ...scoped.memberships[0], assignedSubEventIds: [] }] };
    const res = await listRegistrationsPage(none, {});
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
  });
});

describe("session filter — fails closed, and says which failure it is", () => {
  const subEvent = {
    id: "se1",
    pretixItemId: 9,
    eventMapping: { id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo" },
  };
  // The resolver takes a LIST now — one pretix sweep answers every session.
  const asList = (over: Record<string, unknown> = {}) => [{ ...subEvent, ...over }];

  it("reports notBookable when the session has no pretix item", async () => {
    mock(prisma.subEvent.findMany).mockResolvedValue(asList({ pretixItemId: null }));
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);
    const res = await listRegistrationsPage(sa, { subEventId: "se1" });
    expect(res.sessionFilter).toEqual({ ok: true, notBookable: true });
  });

  it("reports ok:false when pretix cannot be read, rather than a confident zero", async () => {
    // Fails CLOSED — no codes, so no rows — but the caller must be able to tell
    // this apart from "nobody booked", because both render as an empty table.
    mock(prisma.subEvent.findMany).mockResolvedValue(asList());
    mock(prisma.organization.findUnique).mockResolvedValue({ id: "orgA" });
    mock(resolvePretixContext).mockReturnValue({ organizerSlug: "acme", token: "t" });
    mock(listOrders).mockRejectedValue(new Error("pretix is unreachable"));
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);
    const res = await listRegistrationsPage(sa, { subEventId: "se1" });
    expect(res.sessionFilter).toEqual({ ok: false, notBookable: false });
    expect(res.rows).toHaveLength(0);
  });

  it("keeps only orders holding a non-canceled position for that item", async () => {
    mock(prisma.subEvent.findMany).mockResolvedValue(asList());
    mock(prisma.organization.findUnique).mockResolvedValue({ id: "orgA" });
    mock(resolvePretixContext).mockReturnValue({ organizerSlug: "acme", token: "t" });
    mock(listOrders).mockResolvedValue([
      { code: "KEEP1", status: "p", positions: [{ item: 9, canceled: false }] },
      { code: "SKIP_ITEM", status: "p", positions: [{ item: 5, canceled: false }] },
      { code: "SKIP_CANCELED_POS", status: "p", positions: [{ item: 9, canceled: true }] },
      { code: "SKIP_CANCELED_ORDER", status: "c", positions: [{ item: 9, canceled: false }] },
      { code: "KEEP2", status: "n", positions: [{ item: 9, canceled: false }] },
    ]);
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);

    await listRegistrationsPage(sa, { subEventId: "se1" });

    // The constraint the filter adds is the last orderCode clause pushed on AND.
    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    const clause = (where.AND as Record<string, unknown>[])
      .map((c) => (c as { orderCode?: { in?: string[] } }).orderCode?.in)
      .filter(Boolean)
      .pop();
    expect(clause).toEqual(["KEEP1", "KEEP2"]);
  });
});

describe("listRegistrationsPage — never presents a truncated list as the total", () => {
  it("reports the real total and flags a capped page", async () => {
    // The page used to render `rows.length` as the count, so with 812 orders and
    // a limit of 200 it said "200 registrations" — and a session filter turned
    // that into a headcount someone might staff a room from.
    mock(prisma.attendeeOrder.findMany).mockResolvedValue(
      Array.from({ length: 2 }, (_, i) => ({
        id: `o${i}`, orderCode: `C${i}`, eventMappingId: "e1",
        eventMapping: { titleEn: "Expo" }, attendeeName: "A", email: "a@b.com",
        phone: null, company: null, jobTitle: null, roleTag: "visitor", provider: "free",
        status: "paid", approvalStatus: "not_required", createdAt: new Date(),
      })),
    );
    mock(prisma.attendeeOrder.count).mockResolvedValue(812);

    const res = await listRegistrationsPage(sa, {}, { take: 2 });
    expect(res.rows).toHaveLength(2);
    expect(res.total).toBe(812);
    expect(res.capped).toBe(true);
  });

  it("is not capped when the page holds everything", async () => {
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    mock(prisma.attendeeOrder.count).mockResolvedValue(0);
    const res = await listRegistrationsPage(sa, {});
    expect(res.capped).toBe(false);
    expect(res.total).toBe(0);
  });
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
      email: "j@x.com", phone: "70", company: null, jobTitle: null, roleTag: "visitor", method: "COD",
      status: "pending", approvalStatus: "not_required", state: "pending_payment", createdAt: new Date("2026-01-01T00:00:00Z"),
    }];
    const csv = buildCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Event");
    expect(lines[1]).toContain('"Expo, 2026"');
    expect(lines[1]).toContain("ABC12");
  });

  it("neutralizes CSV formula injection in attendee-controlled cells", () => {
    const rows: RegistrationRow[] = [{
      id: "o1", orderCode: "ABC12", event: "Expo", eventId: "e1",
      attendee: "=HYPERLINK(\"http://evil\")", email: "j@x.com", phone: "70",
      company: "@SUM(1)", jobTitle: null, roleTag: "visitor", method: "COD",
      status: "pending", approvalStatus: "not_required", state: "pending_payment",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }];
    const csv = buildCsv(rows);
    // Leading formula chars are prefixed with a single quote so spreadsheets
    // treat them as literal text, never executing them.
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).not.toMatch(/,=HYPERLINK/);
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
