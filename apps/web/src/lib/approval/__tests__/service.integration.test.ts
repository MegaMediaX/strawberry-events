import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/pretix/orders", () => ({
  markOrderPaid: vi.fn().mockResolvedValue({ status: "p" }),
  cancelOrder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

describe.skipIf(!run)("approval integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let svc: typeof import("@/lib/approval/service");
  const stamp = Date.now().toString(36);
  const orgId = `apr-${stamp}`;
  const userId = `apruser-${stamp}`;
  let mappingId = "";

  const admin = (org: string): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [{ organizationId: org, role: "organizer_admin", assignedEventIds: [] }],
  });

  let seq = 0;
  async function makeOrder(provider: "free" | "manual_cod", total: number) {
    const uniq = `${stamp}-${seq++}`;
    return prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `O-${uniq}`,
        email: "a@b.local",
        status: "pending",
        approvalStatus: "pending",
        provider,
        totalCents: total,
        magicLinkToken: `t-${uniq}`,
      },
    });
  }

  beforeAll(async () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    process.env.WEBHOOK_SECRET = "s";
    ({ prisma } = await import("@/lib/db/client"));
    svc = await import("@/lib/approval/service");
    await prisma.organization.create({
      data: { id: orgId, name: "Apr", slug: `apr-${stamp}`, pretixOrganizerSlug: `apr-${stamp}` },
    });
    await prisma.user.create({ data: { id: userId, email: `apr-${stamp}@x.local` } });
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId,
        localEventId: `loc-${stamp}`,
        pretixOrganizerSlug: `apr-${stamp}`,
        pretixEventSlug: `evt-${stamp}`,
        titleEn: "Apr Event",
        visibility: "public",
        approvalMode: "manual",
      },
    });
    mappingId = m.id;
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

  it("approve free → issued (paid)", async () => {
    const o = await makeOrder("free", 0);
    await svc.approve(admin(orgId), o.id);
    const row = await prisma.attendeeOrder.findUnique({ where: { id: o.id } });
    expect(row?.approvalStatus).toBe("approved");
    expect(row?.status).toBe("paid");
  });

  it("approve COD → pending_payment (approved, still pending)", async () => {
    const o = await makeOrder("manual_cod", 2500);
    await svc.approve(admin(orgId), o.id);
    const row = await prisma.attendeeOrder.findUnique({ where: { id: o.id } });
    expect(row?.approvalStatus).toBe("approved");
    expect(row?.status).toBe("pending");
  });

  it("reject → rejected + canceled", async () => {
    const o = await makeOrder("manual_cod", 2500);
    await svc.reject(admin(orgId), o.id);
    const row = await prisma.attendeeOrder.findUnique({ where: { id: o.id } });
    expect(row?.approvalStatus).toBe("rejected");
    expect(row?.status).toBe("canceled");
  });

  it("cross-org admin denied", async () => {
    const o = await makeOrder("free", 0);
    expect(await svc.getApproval(admin("other"), o.id)).toBeNull();
  });
});
