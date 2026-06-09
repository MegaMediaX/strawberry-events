import { describe, it, expect, beforeAll, afterAll } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!run)("API v1 integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let generateKey: typeof import("@/lib/api/keys").generateKey;
  let eventsRoute: typeof import("@/app/api/v1/events/route");
  let meRoute: typeof import("@/app/api/v1/me/route");

  const stamp = Date.now().toString(36);
  const orgA = `api-a-${stamp}`;
  const orgB = `api-b-${stamp}`;
  let rawValid = "";
  let rawNoScope = "";
  let rawRevoked = "";

  function auth(raw: string) {
    return new Request("https://x/api/v1/events", { headers: { authorization: `Bearer ${raw}` } });
  }
  async function seedKey(org: string, scopes: string[], opts: { revoked?: boolean } = {}) {
    const { raw, hash, prefix } = generateKey();
    await prisma.apiKey.create({
      data: {
        organizationId: org, name: "t", keyHash: hash, prefix, scopes,
        rateLimitPerMin: 100, revokedAt: opts.revoked ? new Date() : null,
      },
    });
    return raw;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ generateKey } = await import("@/lib/api/keys"));
    eventsRoute = await import("@/app/api/v1/events/route");
    meRoute = await import("@/app/api/v1/me/route");
    for (const id of [orgA, orgB]) {
      await prisma.organization.create({
        data: { id, name: id, slug: id, pretixOrganizerSlug: id },
      });
      await prisma.eventMapping.create({
        data: {
          organizationId: id, localEventId: `loc-${id}`, pretixOrganizerSlug: id,
          pretixEventSlug: `evt-${id}`, titleEn: `Event ${id}`, visibility: "public",
        },
      });
    }
    rawValid = await seedKey(orgA, ["events:read"]);
    rawNoScope = await seedKey(orgA, ["orders:read"]);
    rawRevoked = await seedKey(orgA, ["events:read"], { revoked: true });
  });

  afterAll(async () => {
    if (!run) return;
    for (const id of [orgA, orgB]) {
      await prisma.apiKey.deleteMany({ where: { organizationId: id } });
      await prisma.eventMapping.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("valid key lists only its org's events with envelope", async () => {
    const res = await eventsRoute.GET(auth(rawValid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.every((e: { slug: string }) => e.slug === `evt-${orgA}`)).toBe(true);
    expect(body.meta.pagination.total).toBe(1);
  });

  it("missing scope → 403 forbidden_scope", async () => {
    const res = await eventsRoute.GET(auth(rawNoScope));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden_scope");
  });

  it("revoked key → 401", async () => {
    const res = await eventsRoute.GET(auth(rawRevoked));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("revoked");
  });

  it("missing key → 401", async () => {
    const res = await eventsRoute.GET(new Request("https://x/api/v1/events"));
    expect(res.status).toBe(401);
  });

  it("DELETE → 405 method_not_allowed", async () => {
    const res = await eventsRoute.DELETE();
    expect(res.status).toBe(405);
    expect((await res.json()).error.code).toBe("method_not_allowed");
  });

  it("/me returns org + scopes for any valid key", async () => {
    const res = await meRoute.GET(auth(rawNoScope));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.organizationId).toBe(orgA);
    expect(body.data.scopes).toContain("orders:read");
  });
});
