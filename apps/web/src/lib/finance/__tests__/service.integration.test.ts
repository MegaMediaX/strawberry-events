import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/pretix/orders", () => ({
  markOrderPaid: vi.fn().mockResolvedValue({ status: "p" }),
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

describe.skipIf(!run)("finance mark-paid integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let svc: typeof import("@/lib/finance/service");
  const stamp = Date.now().toString(36);
  const orgId = `fin-${stamp}`;
  const userId = `finuser-${stamp}`;
  let mappingId = "";
  let orderId = "";

  const finance = (org: string): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [{ organizationId: org, role: "finance", assignedEventIds: [] }],
  });

  beforeAll(async () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    process.env.WEBHOOK_SECRET = "s";
    ({ prisma } = await import("@/lib/db/client"));
    svc = await import("@/lib/finance/service");

    await prisma.organization.create({
      data: { id: orgId, name: "Fin", slug: `fin-${stamp}`, pretixOrganizerSlug: `fin-${stamp}` },
    });
    await prisma.user.create({ data: { id: userId, email: `fin-${stamp}@x.local` } });
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId,
        localEventId: `loc-${stamp}`,
        pretixOrganizerSlug: `fin-${stamp}`,
        pretixEventSlug: `evt-${stamp}`,
        titleEn: "Fin Event",
        visibility: "public",
      },
    });
    mappingId = m.id;
    const o = await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `COD-${stamp}`,
        email: "buyer@x.local",
        status: "pending",
        provider: "manual_cod",
        totalCents: 2500,
        magicLinkToken: `mlt-${stamp}`,
      },
    });
    orderId = o.id;
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("marks a pending COD order paid + writes audit", async () => {
    await svc.markOrderPaid(finance(orgId), orderId);
    const row = await prisma.attendeeOrder.findUnique({ where: { id: orderId } });
    expect(row?.status).toBe("paid");
    const audits = await prisma.auditLog.count({
      where: { organizationId: orgId, action: "order.marked_paid" },
    });
    expect(audits).toBe(1);
  });

  it("denies a finance user from another org", async () => {
    expect(await svc.getFinanceOrder(finance("other-org"), orderId)).toBeNull();
  });
});
