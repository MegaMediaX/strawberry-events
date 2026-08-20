import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    subEvent: { findMany: vi.fn() },
    eventMapping: { findMany: vi.fn() },
    organizationMember: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/admin/users", () => ({
  changeRole: vi.fn(),
  setUserStatus: vi.fn(),
  inviteUser: vi.fn(),
}));

import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { changeRole } from "@/lib/admin/users";
import { changeRoleAction } from "@/app/[locale]/(admin)/admin/users/actions";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

/** One session in orgA. The action rejects when the count of rows found does
 *  not match the count of ids asked for, so each test must mock exactly as many
 *  rows as ids it passes — otherwise it fails on the length check and appears to
 *  prove whatever it was actually testing. */
const oneInOrgA = [{ eventMapping: { organizationId: "orgA", localEventId: "loc1" } }];
const twoInOrgA = [
  { eventMapping: { organizationId: "orgA", localEventId: "loc1" } },
  { eventMapping: { organizationId: "orgA", localEventId: "loc1" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mock(getSessionContext).mockResolvedValue({
    userId: "admin1",
    isSuperAdmin: true,
    memberships: [],
  });
  mock(prisma.subEvent.findMany).mockResolvedValue(oneInOrgA);
  mock(prisma.organizationMember.findMany).mockResolvedValue([]);
  mock(changeRole).mockResolvedValue({});
});

describe("changeRoleAction — granting workshop_organiser", () => {
  it("derives assignedEventIds from the chosen sessions, deduplicated", () => {
    // localEventId, not eventMapping.id — that is what eventScope and
    // canAccessEvent compare against. Deriving the wrong one makes every
    // workshop organiser see nothing, silently.
    mock(prisma.subEvent.findMany).mockResolvedValue(twoInOrgA);
    return changeRoleAction("u1", "orgA", "workshop_organiser", [], ["se1", "se2"]).then(() => {
      const args = mock(changeRole).mock.calls[0];
      expect(args[4]).toEqual(["loc1"]);
      expect(args[5]).toEqual(["se1", "se2"]);
    });
  });

  it("refuses an empty session selection", async () => {
    const res = await changeRoleAction("u1", "orgA", "workshop_organiser", [], []);
    expect(res.ok).toBe(false);
    expect(changeRole).not.toHaveBeenCalled();
  });

  it("refuses sessions belonging to another organization", async () => {
    mock(prisma.subEvent.findMany).mockResolvedValue([
      { eventMapping: { organizationId: "orgB", localEventId: "loc9" } },
    ]);
    const res = await changeRoleAction("u1", "orgA", "workshop_organiser", [], ["se1"]);
    expect(res.ok).toBe(false);
    expect(changeRole).not.toHaveBeenCalled();
  });

  it("refuses when a chosen session no longer exists", async () => {
    // One row back for two ids asked.
    mock(prisma.subEvent.findMany).mockResolvedValue(oneInOrgA);
    const res = await changeRoleAction("u1", "orgA", "workshop_organiser", [], ["se1", "gone"]);
    expect(res.ok).toBe(false);
    expect(changeRole).not.toHaveBeenCalled();
  });

  it("refuses when the target administers ANOTHER organization", async () => {
    mock(prisma.organizationMember.findMany).mockResolvedValue([{ organizationId: "orgB" }]);
    const res = await changeRoleAction("u1", "orgA", "workshop_organiser", [], ["se1"]);
    expect(res.ok).toBe(false);
    expect(changeRole).not.toHaveBeenCalled();
  });

  it("ALLOWS demoting an existing admin of THIS org to workshop organiser", async () => {
    // The guard queries the target's broad roles excluding the org being
    // edited. Without that exclusion it found the row it is about to replace,
    // and rejected the ordinary case of narrowing someone inside their own
    // organization — with a message about "another organization" that was not
    // true. The mock returns [] precisely because the query must exclude orgA.
    mock(prisma.organizationMember.findMany).mockResolvedValue([]);
    const res = await changeRoleAction("u1", "orgA", "workshop_organiser", [], ["se1"]);
    expect(res.ok).toBe(true);
    expect(changeRole).toHaveBeenCalled();
    // And prove the exclusion is actually in the query, not just in the mock.
    const where = mock(prisma.organizationMember.findMany).mock.calls[0][0].where;
    expect(where.organizationId).toEqual({ not: "orgA" });
  });
});

describe("checkin_staff must be given events", () => {
  // canAccessEvent narrows checkin_staff to assignedEventIds. The admin form
  // used to pass [] for every role, so a check-in account could be created that
  // signed in perfectly and was refused on every scan — at a door, with a queue.
  it("refuses a check-in role with no events", async () => {
    const res = await changeRoleAction("u1", "orgA", "checkin_staff", []);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/at least one event/i);
  });

  it("refuses events belonging to another organization", async () => {
    mock(prisma.eventMapping.findMany).mockResolvedValue([]);
    const res = await changeRoleAction("u1", "orgA", "checkin_staff", ["ev-from-org-b"]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different organization/i);
  });

  it("passes the verified events through to changeRole", async () => {
    mock(prisma.eventMapping.findMany).mockResolvedValue([{ localEventId: "ev1" }]);
    const res = await changeRoleAction("u1", "orgA", "checkin_staff", ["ev1"]);
    expect(res.ok).toBe(true);
    // Same positions the workshop_organiser case asserts: events then sessions.
    const args = mock(changeRole).mock.calls[0];
    expect(args[4]).toEqual(["ev1"]);
    expect(args[5]).toEqual([]);
  });

  it("deduplicates repeated event ids", async () => {
    mock(prisma.eventMapping.findMany).mockResolvedValue([
      { localEventId: "ev1" },
      { localEventId: "ev1" },
    ]);
    const res = await changeRoleAction("u1", "orgA", "checkin_staff", ["ev1", "ev1"]);
    expect(res.ok).toBe(true);
    expect(mock(changeRole).mock.calls[0][4]).toEqual(["ev1"]);
  });
});
