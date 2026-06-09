import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

// Live e2e: real pretix + DB. Registers an issued (free) attendee, then checks
// them in against the event's pretix check-in list and asserts a badge is produced.
const run = Boolean(
  process.env.E2E_LIVE && process.env.DATABASE_URL && process.env.PRETIX_API_TOKEN,
);

describe.skipIf(!run)("M8 live check-in e2e", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let register: typeof import("@/lib/registration/service").register;
  let svc: typeof import("@/lib/checkin/service");
  let events: typeof import("@/lib/pretix/events");
  let products: typeof import("@/lib/pretix/products");
  let pretixCheckin: typeof import("@/lib/pretix/checkin");

  const stamp = Date.now().toString(36);
  const organizerSlug = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";
  const token = process.env.PRETIX_API_TOKEN!;
  const slug = `m8-${stamp}`;
  let orgId = "";
  let mappingId = "";
  let listId = 0;
  let userId = "";

  const admin = (): SessionContext => ({
    userId, isSuperAdmin: true, memberships: [],
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ register } = await import("@/lib/registration/service"));
    svc = await import("@/lib/checkin/service");
    events = await import("@/lib/pretix/events");
    products = await import("@/lib/pretix/products");
    pretixCheckin = await import("@/lib/pretix/checkin");

    const org = await prisma.organization.findFirstOrThrow({
      where: { pretixOrganizerSlug: organizerSlug },
    });
    orgId = org.id;
    userId = (await prisma.user.findFirstOrThrow({})).id;

    await events.createEvent(organizerSlug, { slug, titleEn: "M8 Checkin", date_from: "2026-09-01T09:00:00Z" }, token);
    const free = await products.createItem(organizerSlug, slug, { titleEn: "Free", priceCents: 0 }, token);
    await products.createQuota(organizerSlug, slug, { name: "Free", size: 100, items: [free.id] }, token);
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId, localEventId: `loc-${slug}`,
        pretixOrganizerSlug: organizerSlug, pretixEventSlug: slug,
        titleEn: "M8 Checkin", visibility: "public", approvalMode: "none",
        itemTagMap: { [String(free.id)]: "media" },
      },
    });
    mappingId = m.id;
    let lists = await pretixCheckin.listCheckinLists(organizerSlug, slug, token);
    if (lists.length === 0) {
      await pretixCheckin.createCheckinList(organizerSlug, slug, { name: "Main", allProducts: true }, token);
      lists = await pretixCheckin.listCheckinLists(organizerSlug, slug, token);
    }
    listId = lists[0]?.id ?? 0;
  }, 90000);

  afterAll(async () => {
    if (!run) return;
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId, entityType: "order" } });
    await prisma.badgePrintLog.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } });
    await prisma.$disconnect();
  });

  it("issued attendee checks in and gets a badge", async () => {
    const res = await register({
      eventSlug: slug, locale: "en",
      attendee: { firstName: "Jane", lastName: "Doe", email: "jane@x.local", phoneCC: "+961", phone: "70111222", company: "Acme" },
      tickets: [{ itemId: (await products.listItems(organizerSlug, slug, token))[0].id, quantity: 1 }],
      consentTerms: true, consentPrivacy: true,
    });
    expect(res.status).toBe("paid"); // free → issued

    expect(listId).toBeGreaterThan(0);
    const result = await svc.checkInOrder(admin(), mappingId, res.orderCode, listId);
    expect(result.ok).toBe(true);
    expect(result.badge?.tag).toBe("media");
    expect(result.badge?.fullName).toBe("Jane Doe");
    expect(result.badge?.company).toBe("Acme");
  }, 60000);
});
