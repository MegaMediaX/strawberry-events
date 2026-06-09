import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

// Live end-to-end: real DB + real pretix, no mocks. Verifies the three public
// registration flows (free → issued, COD → pending_payment, approval → pending_approval)
// and admin approval issuing a ticket.
// Run with: E2E_LIVE=1 DATABASE_URL=... PRETIX_BASE_URL=... PRETIX_API_TOKEN=...
const run = Boolean(
  process.env.E2E_LIVE && process.env.DATABASE_URL && process.env.PRETIX_API_TOKEN,
);

describe.skipIf(!run)("M7 live registration + approval e2e", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let register: typeof import("@/lib/registration/service").register;
  let approve: typeof import("@/lib/approval/service").approve;
  let state: typeof import("@/lib/approval/state").registrationState;
  let events: typeof import("@/lib/pretix/events");
  let products: typeof import("@/lib/pretix/products");

  const stamp = Date.now().toString(36);
  const organizerSlug = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";
  const token = process.env.PRETIX_API_TOKEN!;
  const openSlug = `m7-open-${stamp}`;
  const vipSlug = `m7-vip-${stamp}`;
  const mappingIds: string[] = [];
  let orgId = "";
  let adminUserId = "";
  let freeItem = 0;
  let codItem = 0;
  let mediaItem = 0;

  const attendee = {
    firstName: "A",
    lastName: "B",
    email: "e2e@strawberry.local",
    phoneCC: "+961",
    phone: "70123456",
  };
  const admin = (): SessionContext => ({
    userId: adminUserId,
    isSuperAdmin: false,
    memberships: [{ organizationId: orgId, role: "organizer_admin", assignedEventIds: [] }],
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ register } = await import("@/lib/registration/service"));
    ({ approve } = await import("@/lib/approval/service"));
    ({ registrationState: state } = await import("@/lib/approval/state"));
    events = await import("@/lib/pretix/events");
    products = await import("@/lib/pretix/products");

    const org = await prisma.organization.findFirstOrThrow({
      where: { pretixOrganizerSlug: organizerSlug },
    });
    orgId = org.id;
    const admin = await prisma.user.findFirstOrThrow({});
    adminUserId = admin.id;

    // Open event (no approval): free + COD items, each with a quota.
    await events.createEvent(
      organizerSlug,
      { slug: openSlug, titleEn: "M7 Open", date_from: "2026-09-01T09:00:00Z" },
      token,
    );
    const free = await products.createItem(organizerSlug, openSlug, { titleEn: "Free", priceCents: 0 }, token);
    const cod = await products.createItem(organizerSlug, openSlug, { titleEn: "Visitor", priceCents: 2500 }, token);
    freeItem = free.id;
    codItem = cod.id;
    await products.createQuota(organizerSlug, openSlug, { name: "Free", size: 100, items: [free.id] }, token);
    await products.createQuota(organizerSlug, openSlug, { name: "Visitor", size: 100, items: [cod.id] }, token);
    const m1 = await prisma.eventMapping.create({
      data: {
        organizationId: orgId, localEventId: `loc-${openSlug}`,
        pretixOrganizerSlug: organizerSlug, pretixEventSlug: openSlug,
        titleEn: "M7 Open", visibility: "public", approvalMode: "none",
      },
    });
    mappingIds.push(m1.id);

    // VIP event (manual approval): Media item (free) + quota.
    await events.createEvent(
      organizerSlug,
      { slug: vipSlug, titleEn: "M7 VIP", date_from: "2026-10-01T09:00:00Z" },
      token,
    );
    const media = await products.createItem(organizerSlug, vipSlug, { titleEn: "Media", priceCents: 0 }, token);
    mediaItem = media.id;
    await products.createQuota(organizerSlug, vipSlug, { name: "Media", size: 50, items: [media.id] }, token);
    const m2 = await prisma.eventMapping.create({
      data: {
        organizationId: orgId, localEventId: `loc-${vipSlug}`,
        pretixOrganizerSlug: organizerSlug, pretixEventSlug: vipSlug,
        titleEn: "M7 VIP", visibility: "public", approvalMode: "manual",
      },
    });
    mappingIds.push(m2.id);
  }, 90000);

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId, entityType: "registration" } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: { in: mappingIds } } });
    await prisma.eventMapping.deleteMany({ where: { id: { in: mappingIds } } });
    await prisma.$disconnect();
  });

  it("free ticket → issued instantly", async () => {
    const res = await register({
      eventSlug: openSlug, locale: "en", attendee,
      tickets: [{ itemId: freeItem, quantity: 1 }],
      consentTerms: true, consentPrivacy: true,
    });
    expect(res.status).toBe("paid");
    const o = await prisma.attendeeOrder.findFirstOrThrow({ where: { orderCode: res.orderCode } });
    expect(state(o)).toBe("issued");
  }, 60000);

  it("COD ticket → pending_payment", async () => {
    const res = await register({
      eventSlug: openSlug, locale: "en", attendee,
      tickets: [{ itemId: codItem, quantity: 1 }],
      consentTerms: true, consentPrivacy: true,
    });
    expect(res.status).toBe("pending");
    const o = await prisma.attendeeOrder.findFirstOrThrow({ where: { orderCode: res.orderCode } });
    expect(state(o)).toBe("pending_payment");
  }, 60000);

  it("approval-required → pending_approval, then approve → issued", async () => {
    const res = await register({
      eventSlug: vipSlug, locale: "en", attendee,
      tickets: [{ itemId: mediaItem, quantity: 1 }],
      consentTerms: true, consentPrivacy: true,
    });
    expect(res.approvalStatus).toBe("pending");
    let o = await prisma.attendeeOrder.findFirstOrThrow({ where: { orderCode: res.orderCode } });
    expect(state(o)).toBe("pending_approval");

    await approve(admin(), o.id);
    o = await prisma.attendeeOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(state(o)).toBe("issued");
  }, 60000);
});
