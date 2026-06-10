import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organizationMember: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { getSessionContext } from "@/lib/auth/session";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.organizationMember.findMany).mockResolvedValue([
    { organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] },
  ]);
});

describe("getSessionContext — suspended block", () => {
  it("returns null when unauthenticated", async () => {
    mock(auth).mockResolvedValue(null);
    expect(await getSessionContext()).toBeNull();
  });

  it("returns null for a suspended user (treated as unauthenticated)", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1" } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "suspended" });
    expect(await getSessionContext()).toBeNull();
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it("builds a context for an active user", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1" } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active" });
    const ctx = await getSessionContext();
    expect(ctx?.userId).toBe("u1");
    expect(ctx?.memberships).toHaveLength(1);
  });
});
