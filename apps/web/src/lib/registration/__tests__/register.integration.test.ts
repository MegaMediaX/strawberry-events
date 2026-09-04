import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Real DB, mocked pretix. Gated on TEST_DATABASE_URL.
const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/pretix/products", () => ({
  listItems: vi.fn().mockResolvedValue([
    { id: 7, titleEn: "Visitor", titleAr: null, priceCents: 2500, active: true },
    { id: 8, titleEn: "Free", titleAr: null, priceCents: 0, active: true },
  ]),
}));
vi.mock("@/lib/pretix/orders", () => ({
  createOrder: vi
    .fn()
    .mockImplementation(async () => ({ code: `C${Date.now().toString(36)}`, status: "n" })),
  markOrderPaid: vi.fn().mockResolvedValue({ status: "p" }),
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

describe.skipIf(!run)("register integration", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let register: typeof import("@/lib/registration/service").register;
  const stamp = Date.now().toString(36);
  const orgId = `regorg-${stamp}`;
  const slug = `reg-evt-${stamp}`;
  const mappingIds: string[] = [];

  beforeAll(async () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    process.env.WEBHOOK_SECRET = "s";
    ({ prisma } = await import("@/lib/db/client"));
    ({ register } = await import("@/lib/registration/service"));
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "RegOrg",
        slug: `reg-${stamp}`,
        pretixOrganizerSlug: `reg-${stamp}`,
      },
    });
    const m = await prisma.eventMapping.create({
      data: {
        organizationId: orgId,
        localEventId: `loc-${stamp}`,
        pretixOrganizerSlug: `reg-${stamp}`,
        pretixEventSlug: slug,
        titleEn: "Reg Event",
        visibility: "public",
        // register() requires liveOnPretix as well as public visibility, so a
        // direct call cannot register against a public-but-not-yet-live event
        // (added by the Ruflo security review). liveOnPretix defaults to false,
        // so omitting it here made every case below fail with "Event not
        // found" — which went unnoticed while this suite was skipped for want
        // of a TEST_DATABASE_URL.
        liveOnPretix: true,
      },
    });
    mappingIds.push(m.id);
  });

  afterAll(async () => {
    if (!run) return;
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: { in: mappingIds } } });
    await prisma.eventMapping.deleteMany({ where: { id: { in: mappingIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  const attendee = {
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    phoneCC: "+961",
    phone: "70123456",
  };

  it("COD ticket writes a pending AttendeeOrder", async () => {
    const res = await register({
      eventSlug: slug,
      locale: "en",
      attendee,
      tickets: [{ itemId: 7, quantity: 1 }],
      consentTerms: true,
      consentPrivacy: true, consentDataUse: true,
    });
    expect(res.status).toBe("pending");
    const row = await prisma.attendeeOrder.findFirst({ where: { orderCode: res.orderCode } });
    expect(row?.status).toBe("pending");
    expect(row?.phone).toBe("70123456");
    expect(row?.phoneCC).toBe("+961");
    expect(row?.consentAt).toBeInstanceOf(Date);
    expect(row?.consentSource).toBe("web_form");
  });

  it("free ticket writes a paid AttendeeOrder", async () => {
    const res = await register({
      eventSlug: slug,
      locale: "en",
      attendee,
      tickets: [{ itemId: 8, quantity: 1 }],
      consentTerms: true,
      consentPrivacy: true, consentDataUse: true,
    });
    expect(res.status).toBe("paid");
  });

  it("refuses a public event that is not yet live on pretix", async () => {
    // The guard that broke the two cases above had no coverage of its own, so
    // nothing would have caught its removal. A draft event is public locally
    // but not yet live, and must not be registrable by a direct call.
    const draftSlug = `reg-draft-${stamp}`;
    const draft = await prisma.eventMapping.create({
      data: {
        organizationId: orgId,
        localEventId: `loc-draft-${stamp}`,
        pretixOrganizerSlug: `reg-${stamp}`,
        pretixEventSlug: draftSlug,
        titleEn: "Draft Event",
        visibility: "public",
        liveOnPretix: false,
      },
    });
    mappingIds.push(draft.id);

    await expect(
      register({
        eventSlug: draftSlug,
        locale: "en",
        attendee,
        tickets: [{ itemId: 8, quantity: 1 }],
        consentTerms: true,
        consentPrivacy: true,
        consentDataUse: true,
      }),
    ).rejects.toThrow("Event not found");
  });
});
