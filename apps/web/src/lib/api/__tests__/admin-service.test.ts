import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    apiKey: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { createApiKey, revokeApiKey } from "@/lib/api/admin-service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u3", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.apiKey.create).mockImplementation(async ({ data }) => ({ ...data, id: "k1" }));
});

describe("createApiKey", () => {
  it("returns raw key once and stores only a hash", async () => {
    const { raw, key } = await createApiKey(orgAdmin, {
      organizationId: "orgA", name: "CI", scopes: ["events:read"],
    });
    expect(raw.startsWith("sk_strawberry_")).toBe(true);
    const stored = mock(prisma.apiKey.create).mock.calls[0][0].data;
    expect(stored.keyHash).toBeDefined();
    expect(stored.keyHash).not.toBe(raw);
    expect(JSON.stringify(stored)).not.toContain(raw); // raw never persisted
    expect(key.id).toBe("k1");
  });

  it("drops invalid scopes", async () => {
    await createApiKey(orgAdmin, { organizationId: "orgA", name: "x", scopes: ["events:read", "bogus"] });
    expect(mock(prisma.apiKey.create).mock.calls[0][0].data.scopes).toEqual(["events:read"]);
  });

  it("finance cannot create", async () => {
    await expect(
      createApiKey(finance, { organizationId: "orgA", name: "x", scopes: [] }),
    ).rejects.toThrow();
  });

  it("check-in staff cannot create", async () => {
    await expect(
      createApiKey(staff, { organizationId: "orgA", name: "x", scopes: [] }),
    ).rejects.toThrow();
  });

  it("impersonating cannot create", async () => {
    await expect(
      createApiKey({ ...orgAdmin, impersonating: true }, { organizationId: "orgA", name: "x", scopes: [] }),
    ).rejects.toThrow();
  });

  it("cross-org create denied", async () => {
    await expect(
      createApiKey(orgAdmin, { organizationId: "orgB", name: "x", scopes: [] }),
    ).rejects.toThrow();
  });
});

describe("revokeApiKey", () => {
  it("revokes own-org key", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue({ id: "k1", organizationId: "orgA" });
    mock(prisma.apiKey.update).mockResolvedValue({ id: "k1", revokedAt: new Date() });
    const res = await revokeApiKey(orgAdmin, "k1");
    expect(res.revokedAt).toBeInstanceOf(Date);
  });

  it("cross-org revoke denied", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue({ id: "k1", organizationId: "orgB" });
    await expect(revokeApiKey(orgAdmin, "k1")).rejects.toThrow();
  });
});
