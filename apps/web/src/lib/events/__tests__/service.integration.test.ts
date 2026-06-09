import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

// Opt-in: runs only when TEST_DATABASE_URL is set (and DATABASE_URL points at
// a migrated throwaway Postgres). pretix is mocked — this exercises the DB +
// scope logic, not the network.
const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/pretix/events", () => ({
  createEvent: vi.fn().mockResolvedValue({ slug: "x" }),
  deleteEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

describe.skipIf(!run)("events service integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let service: typeof import("@/lib/events/service");
  const stamp = Date.now().toString(36);
  const orgAId = `itorgA-${stamp}`;
  const orgBId = `itorgB-${stamp}`;
  const userId = `ituser-${stamp}`;

  beforeAll(async () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    ({ prisma } = await import("@/lib/db/client"));
    service = await import("@/lib/events/service");

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "A", slug: `a-${stamp}`, pretixOrganizerSlug: `a-${stamp}` },
        { id: orgBId, name: "B", slug: `b-${stamp}`, pretixOrganizerSlug: `b-${stamp}` },
      ],
    });
    await prisma.user.create({
      data: { id: userId, email: `it-${stamp}@strawberry.local` },
    });
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.eventMapping.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const sessionFor = (orgId: string): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [{ organizationId: orgId, role: "organizer_admin", assignedEventIds: [] }],
  });

  it("creates a scoped EventMapping + audit, isolated from other orgs", async () => {
    const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: orgAId } });

    const mapping = await service.createEvent(sessionFor(orgAId), orgA, {
      titleEn: "Integration Expo",
      titleAr: null,
      slug: `it-expo-${stamp}`,
      dateFrom: "2026-09-01T09:00:00Z",
      visibility: "public",
      accountMode: "optional",
      approvalMode: "none",
      comingSoon: false,
      live: false,
    });

    expect(mapping.organizationId).toBe(orgAId);

    const audits = await prisma.auditLog.count({
      where: { organizationId: orgAId, action: "event.created" },
    });
    expect(audits).toBe(1);

    // org A sees it; org B does not.
    const aList = await service.listEventsForSession(sessionFor(orgAId));
    expect(aList.some((e) => e.id === mapping.id)).toBe(true);

    const bList = await service.listEventsForSession(sessionFor(orgBId));
    expect(bList.some((e) => e.id === mapping.id)).toBe(false);

    expect(await service.getEventForSession(sessionFor(orgBId), mapping.id)).toBeNull();
  });
});
