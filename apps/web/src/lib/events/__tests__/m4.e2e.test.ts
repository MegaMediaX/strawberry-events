import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt } from "@/lib/crypto";

// Live end-to-end: real DB + real pretix, no mocks. Exercises the admin
// Server-Action code path (the events service) including per-org encrypted
// token resolution, env fallback, and cross-org isolation.
// Run with: E2E_LIVE=1 DATABASE_URL=... PRETIX_BASE_URL=... PRETIX_API_TOKEN=...
const run = Boolean(
  process.env.E2E_LIVE &&
    process.env.DATABASE_URL &&
    process.env.PRETIX_BASE_URL &&
    process.env.PRETIX_API_TOKEN,
);

describe.skipIf(!run)("M4 live e2e", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let service: typeof import("@/lib/events/service");
  let pretixEvents: typeof import("@/lib/pretix/events");
  let pretixProducts: typeof import("@/lib/pretix/products");

  const stamp = Date.now().toString(36);
  const orgBId = `e2eB-${stamp}`;
  const userId = `e2euser-${stamp}`;
  const organizerSlug = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";
  const token = process.env.PRETIX_API_TOKEN!;
  const createdMappingIds: string[] = [];
  let orgAId = "";

  type Session = import("@/lib/auth/types").SessionContext;
  const sessionFor = (orgId: string): Session => ({
    userId,
    isSuperAdmin: false,
    memberships: [
      { organizationId: orgId, role: "organizer_admin", assignedEventIds: [] },
    ],
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    service = await import("@/lib/events/service");
    pretixEvents = await import("@/lib/pretix/events");
    pretixProducts = await import("@/lib/pretix/products");

    // Reuse the seeded org (owns the real pretix organizer 'strawberry').
    const orgA = await prisma.organization.findFirstOrThrow({
      where: { pretixOrganizerSlug: organizerSlug },
    });
    orgAId = orgA.id;

    // org B: DB-only, distinct slug, no token (isolation target).
    await prisma.organization.create({
      data: {
        id: orgBId,
        name: "E2E B",
        slug: `e2e-b-${stamp}`,
        pretixOrganizerSlug: `e2e-b-${stamp}`,
        pretixApiToken: null,
      },
    });
    await prisma.user.create({
      data: { id: userId, email: `e2e-${stamp}@strawberry.local` },
    });
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({
      where: { eventMappingId: { in: createdMappingIds } },
    });
    await prisma.eventMapping.deleteMany({ where: { id: { in: createdMappingIds } } });
    // Reset the seeded org's token back to null.
    if (orgAId) {
      await prisma.organization.update({
        where: { id: orgAId },
        data: { pretixApiToken: null },
      });
    }
    await prisma.organization.deleteMany({ where: { id: orgBId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("per-org encrypted token: create event + ticket (item+quota) + update, in pretix", async () => {
    // Set an encrypted per-org token on the seeded org.
    await prisma.organization.update({
      where: { id: orgAId },
      data: { pretixApiToken: encrypt(token) },
    });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgAId } });

    const slug = `e2e-a-evt-${stamp}`;
    const mapping = await service.createEvent(sessionFor(orgAId), org, {
      titleEn: "E2E Live A",
      titleAr: "حي أ",
      slug,
      dateFrom: "2026-09-01T09:00:00Z",
      visibility: "public",
      accountMode: "optional",
      approvalMode: "none",
      comingSoon: false,
      live: false,
      waitlistEnabled: false,
      seatSelectionEnabled: false,
      badgeAutoPrint: false,
      payBeforeApproval: false,
    });
    createdMappingIds.push(mapping.id);

    const ev = await pretixEvents.getEvent(organizerSlug, slug, token);
    expect(ev.slug).toBe(slug);

    const ticket = await service.createTicket(sessionFor(orgAId), mapping.id, {
      titleEn: "Visitor",
      titleAr: null,
      priceCents: 2500,
      quotaSize: 100,
    });
    expect(ticket.itemId).toBeGreaterThan(0);

    const items = await pretixProducts.listItems(organizerSlug, slug, token);
    expect(items.some((i) => i.id === ticket.itemId)).toBe(true);

    const updated = await service.updateEvent(sessionFor(orgAId), mapping.id, {
      titleEn: "E2E Live A (edited)",
      titleAr: null,
      slug,
      dateFrom: "2026-09-01T09:00:00Z",
      visibility: "public",
      accountMode: "optional",
      approvalMode: "none",
      comingSoon: false,
      live: false,
      waitlistEnabled: false,
      seatSelectionEnabled: false,
      badgeAutoPrint: false,
      payBeforeApproval: false,
    });
    expect(updated.titleEn).toBe("E2E Live A (edited)");
  }, 60000);

  it("env-fallback token: create event when org has no stored token", async () => {
    await prisma.organization.update({
      where: { id: orgAId },
      data: { pretixApiToken: null },
    });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgAId } });

    const slug = `e2e-fb-evt-${stamp}`;
    const mapping = await service.createEvent(sessionFor(orgAId), org, {
      titleEn: "E2E Fallback",
      titleAr: null,
      slug,
      dateFrom: "2026-09-02T09:00:00Z",
      visibility: "public",
      accountMode: "optional",
      approvalMode: "none",
      comingSoon: false,
      live: false,
      waitlistEnabled: false,
      seatSelectionEnabled: false,
      badgeAutoPrint: false,
      payBeforeApproval: false,
    });
    createdMappingIds.push(mapping.id);

    const ev = await pretixEvents.getEvent(organizerSlug, slug, token);
    expect(ev.slug).toBe(slug);
  }, 60000);

  it("enforces cross-org isolation", async () => {
    const aEvents = await service.listEventsForSession(sessionFor(orgAId));
    const bEvents = await service.listEventsForSession(sessionFor(orgBId));
    const bIds = new Set(bEvents.map((e) => e.id));
    for (const e of aEvents) expect(bIds.has(e.id)).toBe(false);
    expect(aEvents.length).toBeGreaterThan(0);
    expect(bEvents.length).toBe(0);

    expect(
      await service.getEventForSession(sessionFor(orgBId), aEvents[0].id),
    ).toBeNull();
  });
});
