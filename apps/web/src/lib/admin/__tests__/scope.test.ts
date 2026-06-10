import { describe, it, expect } from "vitest";
import type { SessionContext } from "@/lib/auth/types";
import { eventScope, orderScope } from "@/lib/admin/scope";

const sa: SessionContext = { userId: "u", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgB", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1", "loc2"] }],
};
const none: SessionContext = { userId: "u", isSuperAdmin: false, memberships: [] };

describe("eventScope", () => {
  it("is unconstrained (null) for super admin", () => {
    expect(eventScope(sa)).toBeNull();
  });
  it("constrains organizer_admin to their org", () => {
    expect(eventScope(orgAdmin)).toEqual({ OR: [{ organizationId: "orgA" }] });
  });
  it("constrains finance to their org", () => {
    expect(eventScope(finance)).toEqual({ OR: [{ organizationId: "orgB" }] });
  });
  it("constrains checkin_staff to assigned events within the org", () => {
    expect(eventScope(staff)).toEqual({
      OR: [{ organizationId: "orgA", localEventId: { in: ["loc1", "loc2"] } }],
    });
  });
  it("matches nothing for a non-super user with no memberships", () => {
    expect(eventScope(none)).toEqual({ id: "__never__" });
  });
});

describe("orderScope", () => {
  it("is empty for super admin", () => {
    expect(orderScope(sa)).toEqual({});
  });
  it("wraps the event scope under eventMapping for non-super", () => {
    expect(orderScope(orgAdmin)).toEqual({ eventMapping: { OR: [{ organizationId: "orgA" }] } });
  });
});
