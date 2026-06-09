import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));

import { prisma } from "@/lib/db/client";
import { authenticateRequest, assertEventAccess, ApiError } from "@/lib/api/auth";
import { hashKey } from "@/lib/api/keys";
import { __resetRateLimit } from "@/lib/api/rate-limit";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const RAW = "sk_strawberry_testtoken123";

function req(auth?: string) {
  return new Request("https://api/v1/events", {
    headers: auth ? { authorization: auth } : {},
  });
}
function key(over = {}) {
  return {
    id: "k1", organizationId: "orgA", scopes: ["events:read"], eventRestrictions: [],
    rateLimitPerMin: 3, revokedAt: null, expiresAt: null, keyHash: hashKey(RAW), ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
});

describe("authenticateRequest", () => {
  it("rejects missing key", async () => {
    await expect(authenticateRequest(req(), "events:read")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects invalid key", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue(null);
    await expect(authenticateRequest(req(`Bearer ${RAW}`), "events:read")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("rejects revoked and expired keys", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue(key({ revokedAt: new Date() }));
    await expect(authenticateRequest(req(`Bearer ${RAW}`), "events:read")).rejects.toMatchObject({
      code: "revoked",
    });
    mock(prisma.apiKey.findUnique).mockResolvedValue(
      key({ expiresAt: new Date("2000-01-01") }),
    );
    await expect(authenticateRequest(req(`Bearer ${RAW}`), "events:read")).rejects.toMatchObject({
      code: "expired",
    });
  });

  it("rejects missing scope (403)", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue(key({ scopes: ["events:read"] }));
    await expect(authenticateRequest(req(`Bearer ${RAW}`), "attendees:write")).rejects.toMatchObject(
      { code: "forbidden_scope", status: 403 },
    );
  });

  it("passes and returns context for a valid key", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue(key());
    const ctx = await authenticateRequest(req(`Bearer ${RAW}`), "events:read");
    expect(ctx.organizationId).toBe("orgA");
  });

  it("rate limits after rateLimitPerMin (429)", async () => {
    mock(prisma.apiKey.findUnique).mockResolvedValue(key({ rateLimitPerMin: 2 }));
    await authenticateRequest(req(`Bearer ${RAW}`), "events:read");
    await authenticateRequest(req(`Bearer ${RAW}`), "events:read");
    await expect(authenticateRequest(req(`Bearer ${RAW}`), "events:read")).rejects.toMatchObject({
      code: "rate_limited", status: 429,
    });
  });
});

describe("assertEventAccess", () => {
  const base = { keyId: "k", organizationId: "orgA", scopes: [], rate: {} as never };
  it("allows when no restrictions", () => {
    expect(() => assertEventAccess({ ...base, eventRestrictions: [] }, "e1")).not.toThrow();
  });
  it("allows listed event, denies others", () => {
    expect(() => assertEventAccess({ ...base, eventRestrictions: ["e1"] }, "e1")).not.toThrow();
    expect(() => assertEventAccess({ ...base, eventRestrictions: ["e1"] }, "e2")).toThrow(ApiError);
  });
});
