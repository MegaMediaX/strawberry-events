import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: { auditLog: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn() } },
}));

import { prisma } from "@/lib/db/client";
import { query, getEntry } from "@/lib/audit/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const superAdmin: SessionContext = { userId: "s", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};

beforeEach(() => vi.clearAllMocks());

describe("query", () => {
  it("non-super is restricted to own org ids", async () => {
    await query(orgAdmin, {});
    expect(mock(prisma.auditLog.findMany).mock.calls[0][0].where.organizationId).toEqual({ in: ["orgA"] });
  });

  it("non-super cannot widen to another org (falls back to own)", async () => {
    await query(orgAdmin, { organizationId: "orgB" });
    expect(mock(prisma.auditLog.findMany).mock.calls[0][0].where.organizationId).toEqual({ in: ["orgA"] });
  });

  it("super can filter by a specific org", async () => {
    await query(superAdmin, { organizationId: "orgZ" });
    expect(mock(prisma.auditLog.findMany).mock.calls[0][0].where.organizationId).toBe("orgZ");
  });

  it("applies action / impersonation / success / date filters", async () => {
    await query(superAdmin, {
      action: "smtp.test_failed", success: false, impersonationOnly: true,
      from: new Date("2026-01-01"), to: new Date("2026-02-01"),
    });
    const w = mock(prisma.auditLog.findMany).mock.calls[0][0].where;
    expect(w.action).toBe("smtp.test_failed");
    expect(w.success).toBe(false);
    expect(w.impersonatedUserId).toEqual({ not: null });
    expect(w.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe("getEntry", () => {
  it("returns null cross-org for non-super", async () => {
    mock(prisma.auditLog.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgB" });
    expect(await getEntry(orgAdmin, "a1")).toBeNull();
  });
  it("returns own-org entry", async () => {
    mock(prisma.auditLog.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA" });
    expect(await getEntry(orgAdmin, "a1")).toMatchObject({ id: "a1" });
  });
});
