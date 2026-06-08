import { describe, it, expect } from "vitest";
import { hasAnyRole, assertRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";

const superAdmin: SessionContext = {
  userId: "u1",
  isSuperAdmin: true,
  memberships: [],
};

const finance: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [
    { organizationId: "orgA", role: "finance", assignedEventIds: [] },
  ],
};

describe("hasAnyRole", () => {
  it("super admin satisfies any role requirement", () => {
    expect(hasAnyRole(superAdmin, ["organizer_admin"])).toBe(true);
  });

  it("matches when the user holds one of the roles", () => {
    expect(hasAnyRole(finance, ["finance", "organizer_admin"])).toBe(true);
  });

  it("fails when the user holds none of the roles", () => {
    expect(hasAnyRole(finance, ["organizer_admin"])).toBe(false);
  });
});

describe("assertRole", () => {
  it("passes for an allowed role", () => {
    expect(() => assertRole(finance, ["finance"])).not.toThrow();
  });

  it("throws ForbiddenError for a disallowed role", () => {
    expect(() => assertRole(finance, ["organizer_admin"])).toThrow(
      ForbiddenError,
    );
  });
});
