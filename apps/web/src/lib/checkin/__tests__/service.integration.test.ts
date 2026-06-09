import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/pretix/checkin", () => ({
  redeemCheckin: vi.fn().mockResolvedValue({ status: "ok" }),
  checkinCounters: vi.fn().mockResolvedValue({ total: 1, checkedIn: 1 }),
}));

describe.skipIf(!run)("checkin integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let svc: typeof import("@/lib/checkin/service");
  const stamp = Date.now().toString(36);
  const orgId = `ci-${stamp}`;
  const userId = `ciuser-${stamp}`;
  let mappingId = "";

  const staff = (assigned: string[]): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [{ organizationId: orgId, role: "checkin_staff", assignedEventIds: assigned }],
  });

  async function order(status: string, approvalStatus: string, code: string) {
    return prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId, orderCode: code, email: "a@b.local",
        status: status as never, approvalStatus: approvalStatus as never,
        provider: "manual_cod", roleTag: "media", pretixSecret: `sec-${code}`,
        magicLinkToken: `t-${code}`,
      },
    });
  }

  beforeAll(async () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    ({ prisma } = await import("@/lib/db/client"));
    svc = await import("@/lib/checkin/service");
    await prisma.organization.create({
      data: { id: orgId, name: "CI", slug: `ci-${stamp}`, pretixOrganizerSlug: `ci-${stamp}` },
    });
    await prisma.user.create({ data: { id: userId, email: `ci-${stamp}@x.local` } });
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId, localEventId: `loc-${stamp}`,
        pretixOrganizerSlug: `ci-${stamp}`, pretixEventSlug: `evt-${stamp}`,
        titleEn: "CI Event", visibility: "public",
      },
    });
    mappingId = m.id;
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.badgePrintLog.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("issued order → checked in, badge log + audit written", async () => {
    await order("paid", "not_required", `OK-${stamp}`);
    const res = await svc.checkInOrder(staff([`loc-${stamp}`]), mappingId, `OK-${stamp}`, 1);
    expect(res.ok).toBe(true);
    const logs = await prisma.badgePrintLog.count({ where: { eventMappingId: mappingId } });
    expect(logs).toBe(1);
    const audits = await prisma.auditLog.count({
      where: { organizationId: orgId, action: "attendee.checked_in" },
    });
    expect(audits).toBe(1);
  });

  it("pending-payment order → rejected, no badge log", async () => {
    await order("pending", "not_required", `PP-${stamp}`);
    const res = await svc.checkInOrder(staff([`loc-${stamp}`]), mappingId, `PP-${stamp}`, 1);
    expect(res.ok).toBe(false);
  });

  it("staff not assigned to the event → denied", async () => {
    await expect(
      svc.checkInOrder(staff(["other-loc"]), mappingId, `OK-${stamp}`, 1),
    ).rejects.toThrow();
  });
});
