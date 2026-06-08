import { describe, it, expect } from "vitest";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";
import type { SessionContext } from "@/lib/auth/types";

const superAdmin: SessionContext = {
  userId: "u1",
  isSuperAdmin: true,
  memberships: [],
};

const orgAdmin: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [
    { organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] },
  ],
};

const staff: SessionContext = {
  userId: "u3",
  isSuperAdmin: false,
  memberships: [
    { organizationId: "orgB", role: "checkin_staff", assignedEventIds: ["e1"] },
  ],
};

describe("scopeWhere", () => {
  it("returns an empty filter for super admin (no constraint)", () => {
    expect(scopeWhere(superAdmin)).toEqual({});
  });

  it("constrains to the member's organizations", () => {
    expect(scopeWhere(orgAdmin)).toEqual({
      organizationId: { in: ["orgA"] },
    });
  });

  it("merges an existing where clause", () => {
    expect(scopeWhere(orgAdmin, { status: "active" })).toEqual({
      status: "active",
      organizationId: { in: ["orgA"] },
    });
  });
});

describe("canAccessEvent", () => {
  it("super admin can access any event", () => {
    expect(canAccessEvent(superAdmin, "orgX", "anything")).toBe(true);
  });

  it("org admin can access any event in their org", () => {
    expect(canAccessEvent(orgAdmin, "orgA", "e99")).toBe(true);
    expect(canAccessEvent(orgAdmin, "orgB", "e99")).toBe(false);
  });

  it("staff can only access assigned events", () => {
    expect(canAccessEvent(staff, "orgB", "e1")).toBe(true);
    expect(canAccessEvent(staff, "orgB", "e2")).toBe(false);
  });
});
