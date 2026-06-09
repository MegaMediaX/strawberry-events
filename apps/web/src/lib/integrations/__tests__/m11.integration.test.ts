import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");

describe.skipIf(!run)("M11 integration (smtp/archive/audit)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let smtp: typeof import("@/lib/integrations/smtp-service");
  let archive: typeof import("@/lib/archive/service");
  let audit: typeof import("@/lib/audit/service");

  const stamp = Date.now().toString(36);
  const orgA = `m11a-${stamp}`;
  const orgB = `m11b-${stamp}`;
  const userId = `m11u-${stamp}`;

  const admin = (org: string): SessionContext => ({
    userId, isSuperAdmin: false,
    memberships: [{ organizationId: org, role: "organizer_admin", assignedEventIds: [] }],
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    smtp = await import("@/lib/integrations/smtp-service");
    archive = await import("@/lib/archive/service");
    audit = await import("@/lib/audit/service");
    for (const id of [orgA, orgB]) {
      await prisma.organization.create({ data: { id, name: id, slug: id, pretixOrganizerSlug: id } });
    }
    await prisma.user.create({ data: { id: userId, email: `m11-${stamp}@x.local` } });
  });

  afterAll(async () => {
    if (!run) return;
    for (const id of [orgA, orgB]) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.archiveQueue.deleteMany({ where: { organizationId: id } });
      await prisma.smtpSetting.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("SMTP password stored encrypted; view never returns it", async () => {
    await smtp.saveSmtp(admin(orgA), orgA, {
      host: "smtp.x", port: 587, fromName: "F", fromEmail: "f@x", encryption: "tls", password: "topsecret",
    });
    const raw = await prisma.smtpSetting.findUnique({ where: { organizationId: orgA } });
    expect(raw?.passwordEnc).toBeTruthy();
    expect(raw?.passwordEnc).not.toBe("topsecret");
    const view = await smtp.getSmtp(admin(orgA), orgA);
    expect(view).not.toHaveProperty("password");
    expect(view).not.toHaveProperty("passwordEnc");
    expect(view?.passwordConfigured).toBe(true);
  });

  it("archive queues + restores (no hard delete)", async () => {
    const row = await archive.archive(admin(orgA), {
      entityType: "order", entityId: "o1", organizationId: orgA, payload: { x: 1 }, targetName: "Order o1",
    });
    expect(row.status).toBe("queued");
    const restored = await archive.restore(admin(orgA), row.id);
    expect(restored.status).toBe("restored");
  });

  it("cleanup marks past-window queued records purged", async () => {
    const old = await prisma.archiveQueue.create({
      data: {
        entityType: "order", entityId: "o2", organizationId: orgA, payload: { y: 2 },
        status: "queued", purgeAfter: new Date(Date.now() - 1000),
      },
    });
    const res = await archive.cleanup(admin(orgA), new Date());
    expect(res.purged).toBeGreaterThanOrEqual(1);
    const after = await prisma.archiveQueue.findUnique({ where: { id: old.id } });
    expect(after?.status).toBe("purged");
  });

  it("audit query is org-isolated", async () => {
    await audit.record({ organizationId: orgA, action: "test.a", entityType: "t", entityId: "1" });
    await audit.record({ organizationId: orgB, action: "test.b", entityType: "t", entityId: "2" });
    const rows = await audit.query(admin(orgA), {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });
});
