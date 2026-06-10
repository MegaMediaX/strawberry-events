import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: { organization: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/db/client";
import { resolveOrgId } from "@/lib/admin/resolve-org";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveOrgId", () => {
  it("returns the organizer_admin membership's org", async () => {
    const s: SessionContext = {
      userId: "u1", isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
    };
    expect(await resolveOrgId(s)).toBe("orgA");
  });

  it("returns the finance membership's org when there is no organizer_admin", async () => {
    const s: SessionContext = {
      userId: "u2", isSuperAdmin: false,
      memberships: [{ organizationId: "orgF", role: "finance", assignedEventIds: [] }],
    };
    expect(await resolveOrgId(s)).toBe("orgF");
  });

  it("falls back to the first org for a super admin with no memberships", async () => {
    mock(prisma.organization.findFirst).mockResolvedValue({ id: "org1" });
    const s: SessionContext = { userId: "su", isSuperAdmin: true, memberships: [] };
    expect(await resolveOrgId(s)).toBe("org1");
  });

  it("returns null for a super admin when no org exists", async () => {
    mock(prisma.organization.findFirst).mockResolvedValue(null);
    const s: SessionContext = { userId: "su", isSuperAdmin: true, memberships: [] };
    expect(await resolveOrgId(s)).toBeNull();
  });

  it("returns null for a non-admin with no memberships", async () => {
    const s: SessionContext = { userId: "u3", isSuperAdmin: false, memberships: [] };
    expect(await resolveOrgId(s)).toBeNull();
  });
});
