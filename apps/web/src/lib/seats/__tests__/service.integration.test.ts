import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

describe.skipIf(!run)("seats + waitlist integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let seats: typeof import("@/lib/seats/service");
  let waitlist: typeof import("@/lib/waitlist/service");
  const stamp = Date.now().toString(36);
  const orgId = `sw-${stamp}`;
  const userId = `swuser-${stamp}`;
  let mappingId = "";
  const seatIds: string[] = [];

  const admin = (org: string): SessionContext => ({
    userId, isSuperAdmin: false,
    memberships: [{ organizationId: org, role: "organizer_admin", assignedEventIds: [] }],
  });

  beforeAll(async () => {
    process.env.APP_URL = "https://x";
    ({ prisma } = await import("@/lib/db/client"));
    seats = await import("@/lib/seats/service");
    waitlist = await import("@/lib/waitlist/service");
    await prisma.organization.create({
      data: { id: orgId, name: "SW", slug: `sw-${stamp}`, pretixOrganizerSlug: `sw-${stamp}` },
    });
    await prisma.user.create({ data: { id: userId, email: `sw-${stamp}@x.local` } });
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId, localEventId: `loc-${stamp}`,
        pretixOrganizerSlug: `sw-${stamp}`, pretixEventSlug: `evt-${stamp}`,
        titleEn: "SW Event", visibility: "public",
      },
    });
    mappingId = m.id;
    const map = await prisma.seatMap.create({ data: { eventMappingId: mappingId, name: "Main" } });
    const section = await prisma.seatSection.create({ data: { seatMapId: map.id, name: "A" } });
    const row = await prisma.seatRow.create({ data: { sectionId: section.id, label: "A" } });
    for (const label of ["1", "2"]) {
      const s = await prisma.seatAssignment.create({
        data: { rowId: row.id, label, state: "available" },
      });
      seatIds.push(s.id);
    }
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.waitlistEntry.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.seatAssignment.deleteMany({ where: { id: { in: seatIds } } });
    // cascade cleans rows/sections/maps via eventMapping delete
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("hold → confirm → release", async () => {
    await seats.holdSeats(mappingId, seatIds, "holder1");
    let rows = await prisma.seatAssignment.findMany({ where: { id: { in: seatIds } } });
    expect(rows.every((s) => s.state === "temporarily_held")).toBe(true);

    await seats.confirmSeats(seatIds, "ORDER1");
    rows = await prisma.seatAssignment.findMany({ where: { id: { in: seatIds } } });
    expect(rows.every((s) => s.state === "sold_or_reserved")).toBe(true);

    await seats.releaseSeats("ORDER1");
    rows = await prisma.seatAssignment.findMany({ where: { id: { in: seatIds } } });
    expect(rows.every((s) => s.state === "available")).toBe(true);
  });

  it("holdSeats rejects an already-held seat", async () => {
    await seats.holdSeats(mappingId, [seatIds[0]], "holderA");
    await expect(seats.holdSeats(mappingId, [seatIds[0]], "holderB")).rejects.toThrow();
    await seats.releaseSeats("holderA"); // attendeeRef was holderA on hold
  });

  it("waitlist join assigns positions, promote works", async () => {
    const e1 = await waitlist.joinWaitlist(mappingId, "a@x.local", null);
    const e2 = await waitlist.joinWaitlist(mappingId, "b@x.local", null);
    expect(e2.position).toBe(e1.position + 1);

    const promoted = await waitlist.promote(admin(orgId), e1.id);
    expect(promoted.status).toBe("promoted");

    // cross-org denied
    await expect(waitlist.promote(admin("other"), e2.id)).rejects.toThrow();
  });
});
