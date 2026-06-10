import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { eventMapping: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/db/client";
import { resolveApiEvent } from "@/lib/api/handler";
import { ApiError, type ApiContext } from "@/lib/api/auth";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function ctx(overrides: Partial<ApiContext> = {}): ApiContext {
  return {
    keyId: "k1",
    organizationId: "orgA",
    eventRestrictions: [],
    scopes: [],
    rate: { allowed: true, limit: 120, remaining: 119, resetAt: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveApiEvent", () => {
  it("fails closed for a key with no organization (null org IDOR)", async () => {
    await expect(
      resolveApiEvent(ctx({ organizationId: null }), "e1"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(prisma.eventMapping.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the query to the key's organization", async () => {
    mock(prisma.eventMapping.findFirst).mockResolvedValue({ id: "e1" });
    await resolveApiEvent(ctx({ organizationId: "orgA" }), "e1");
    const arg = mock(prisma.eventMapping.findFirst).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "e1", organizationId: "orgA" });
  });
});
