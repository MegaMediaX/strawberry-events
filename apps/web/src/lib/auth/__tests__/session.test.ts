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
    mock(auth).mockResolvedValue({ user: { id: "u1", sessionVersion: 0 } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "suspended", sessionVersion: 0 });
    expect(await getSessionContext()).toBeNull();
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it("builds a context for an active user", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1", sessionVersion: 0 } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 0 });
    const ctx = await getSessionContext();
    expect(ctx?.userId).toBe("u1");
    expect(ctx?.memberships).toHaveLength(1);
  });
});

describe("getSessionContext — session invalidation", () => {
  it("returns null when the token's sessionVersion is stale (post password reset)", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1", sessionVersion: 1 } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 2 });
    expect(await getSessionContext()).toBeNull();
    // Same shape as the suspended path: no memberships are loaded for a session
    // we have already decided to reject.
    expect(prisma.organizationMember.findMany).not.toHaveBeenCalled();
  });

  it("accepts a token whose sessionVersion matches a bumped account", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1", sessionVersion: 2 } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 2 });
    expect((await getSessionContext())?.userId).toBe("u1");
  });

  // Back-compat: tokens minted before the sessionVersion column existed carry no
  // claim. They must keep working against the default-0 rows, otherwise the
  // rollout signs every live user out.
  it("accepts a legacy token with no sessionVersion claim against a version-0 account", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1" } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 0 });
    expect((await getSessionContext())?.userId).toBe("u1");
  });

  it("rejects a legacy token with no claim once the account has been reset", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1" } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 1 });
    expect(await getSessionContext()).toBeNull();
  });

  it("reads status and sessionVersion in a single user query", async () => {
    mock(auth).mockResolvedValue({ user: { id: "u1", sessionVersion: 0 } });
    mock(prisma.user.findUnique).mockResolvedValue({ status: "active", sessionVersion: 0 });
    await getSessionContext();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mock(prisma.user.findUnique).mock.calls[0][0].select).toEqual({
      status: true,
      sessionVersion: true,
    });
  });
});
