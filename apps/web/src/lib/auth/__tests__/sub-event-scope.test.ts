import { describe, it, expect } from "vitest";
import { subEventScope, canAccessSubEvent, canAccessEvent } from "@/lib/auth/org-scope";
import type { SessionContext, Membership } from "@/lib/auth/types";

const member = (over: Partial<Membership>): Membership => ({
  organizationId: "orgA",
  role: "workshop_organiser",
  assignedEventIds: ["loc1"],
  assignedSubEventIds: [],
  ...over,
});

const ctx = (over: Partial<SessionContext>): SessionContext => ({
  userId: "u1",
  isSuperAdmin: false,
  memberships: [],
  ...over,
});

describe("subEventScope", () => {
  it("returns null for a super admin", () => {
    expect(subEventScope(ctx({ isSuperAdmin: true }))).toBeNull();
  });

  it("returns null when no workshop_organiser membership exists", () => {
    expect(subEventScope(ctx({ memberships: [member({ role: "finance" })] }))).toBeNull();
  });

  it("returns the assigned sessions for a workshop organiser", () => {
    const s = ctx({ memberships: [member({ assignedSubEventIds: ["se1", "se2"] })] });
    expect(subEventScope(s)).toEqual(["se1", "se2"]);
  });

  it("returns an empty array when assigned nothing — restricted, not unrestricted", () => {
    // The distinction that matters: [] means "may see nothing", null means "no
    // limit". Conflating them either locks out an admin or hands a workshop
    // organiser the entire attendee list.
    expect(subEventScope(ctx({ memberships: [member({})] }))).toEqual([]);
  });

  it("checkin_staff does NOT lift the restriction", () => {
    // It is itself narrowed per membership by assignedEventIds, so treating it
    // as broad handed an organiser unrestricted visibility in another org.
    const s = ctx({
      memberships: [
        member({ assignedSubEventIds: ["se1"] }),
        member({ organizationId: "orgB", role: "checkin_staff" }),
      ],
    });
    expect(subEventScope(s)).toEqual(["se1"]);
  });

  it("a genuinely org-wide role held anywhere lifts the restriction", () => {
    // Someone can legitimately run a workshop for one org and administer
    // another. The broader grant wins rather than the narrower one clamping it.
    const s = ctx({
      memberships: [
        member({ assignedSubEventIds: ["se1"] }),
        member({ organizationId: "orgB", role: "organizer_admin" }),
      ],
    });
    expect(subEventScope(s)).toBeNull();
  });

  it("merges sessions across several workshop memberships", () => {
    const s = ctx({
      memberships: [
        member({ assignedSubEventIds: ["se1"] }),
        member({ organizationId: "orgB", assignedSubEventIds: ["se2", "se1"] }),
      ],
    });
    expect(subEventScope(s)?.sort()).toEqual(["se1", "se2"]);
  });
});

describe("canAccessSubEvent", () => {
  it("permits an assigned session and refuses any other", () => {
    const s = ctx({ memberships: [member({ assignedSubEventIds: ["se1"] })] });
    expect(canAccessSubEvent(s, "se1")).toBe(true);
    expect(canAccessSubEvent(s, "se-other")).toBe(false);
  });

  it("permits anything when unrestricted", () => {
    expect(canAccessSubEvent(ctx({ isSuperAdmin: true }), "anything")).toBe(true);
  });
});

describe("canAccessEvent — the outer gate for a workshop organiser", () => {
  it("admits only the events named on the membership", () => {
    const s = ctx({ memberships: [member({ assignedEventIds: ["loc1"], assignedSubEventIds: ["se1"] })] });
    expect(canAccessEvent(s, "orgA", "loc1")).toBe(true);
    expect(canAccessEvent(s, "orgA", "loc2")).toBe(false);
    expect(canAccessEvent(s, "orgB", "loc1")).toBe(false);
  });
});
