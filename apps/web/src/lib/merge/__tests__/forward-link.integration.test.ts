import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { MemberRole } from "@prisma/client";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

/**
 * Forward-linking is the one path with no human in the loop — no token to hold,
 * no code to type. So what it REFUSES matters more than what it links, and the
 * bookkeeping matters more still: without it this would be the single way a
 * registration becomes owned with no ledger row and no notice.
 */
describe.skipIf(!run)("forward-linking (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let resolveForwardLink: typeof import("@/lib/merge/forward-link").resolveForwardLink;
  let applyForwardLink: typeof import("@/lib/merge/forward-link").applyForwardLink;

  const s = Date.now();
  let orgId = "", mappingId = "";
  let verified = "", unverified = "", suspended = "", staff = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ resolveForwardLink, applyForwardLink } = await import("@/lib/merge/forward-link"));

    orgId = (await prisma.organization.create({
      data: { name: `F${s}`, slug: `f${s}`, pretixOrganizerSlug: `pf${s}` },
    })).id;
    mappingId = (await prisma.eventMapping.create({
      data: { organizationId: orgId, localEventId: `lf${s}`, titleEn: "Forward Event", pretixOrganizerSlug: `pf${s}`, pretixEventSlug: `ef${s}` },
    })).id;

    verified = (await prisma.user.create({
      data: { email: `ver-${s}@t.test`, passwordHash: "x", emailVerified: new Date() },
    })).id;
    unverified = (await prisma.user.create({
      data: { email: `unv-${s}@t.test`, passwordHash: "x", emailVerified: null },
    })).id;
    suspended = (await prisma.user.create({
      data: { email: `sus-${s}@t.test`, passwordHash: "x", emailVerified: new Date(), status: "suspended" },
    })).id;
    staff = (await prisma.user.create({
      data: { email: `stf-${s}@t.test`, passwordHash: "x", emailVerified: new Date() },
    })).id;
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: staff, role: "organizer_admin" as MemberRole },
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [verified, unverified, suspended, staff] } } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
  });

  afterAll(async () => {
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [verified, unverified, suspended, staff] } } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.eventMapping.delete({ where: { id: mappingId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [verified, unverified, suspended, staff] } } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  const makeOrder = (email: string) =>
    prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `F${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        email,
        magicLinkToken: `fl-${Math.random()}`,
      },
    });

  it("links to an account whose address is verified", async () => {
    expect(await resolveForwardLink(`VER-${s}@T.test `)).toBe(verified); // normalised
  });

  /**
   * The account's own proof is the only proof there is here — nobody typed a
   * code and nobody clicked a link. An unverified address proves nothing about
   * the mailbox, so it must not silently take ownership.
   */
  it("refuses an unverified address", async () => {
    expect(await resolveForwardLink(`unv-${s}@t.test`)).toBeNull();
  });

  it("refuses a suspended account, a staff account, an unknown address and a blank one", async () => {
    expect(await resolveForwardLink(`sus-${s}@t.test`)).toBeNull();
    expect(await resolveForwardLink(`stf-${s}@t.test`)).toBeNull();
    expect(await resolveForwardLink(`nobody-${s}@t.test`)).toBeNull();
    expect(await resolveForwardLink("")).toBeNull();
    expect(await resolveForwardLink("   ")).toBeNull();
  });

  /**
   * The invariant that stops this being a back door: every owned registration
   * has a ledger row explaining why it is owned.
   */
  /**
   * Ownership and its ledger row now arrive together, from one transaction.
   *
   * The first version set userId in the order's own INSERT and wrote the ledger
   * afterwards, outside any transaction — so a failed ledger write left a
   * permanently owned registration with no record and no notice, exactly the
   * silent back door this feature exists to close.
   */
  it("takes ownership and records it in the same transaction", async () => {
    const order = await makeOrder(`ver-${s}@t.test`);
    expect(order.userId).toBeNull();

    await applyForwardLink({ orderId: order.id, userId: verified, locale: "en" });

    expect((await prisma.attendeeOrder.findUnique({ where: { id: order.id } }))?.userId).toBe(verified);

    const entity = await prisma.accountMergeEventEntity.findFirst({
      where: { entityId: order.id },
      include: { mergeEvent: true },
    });
    expect(entity).not.toBeNull();
    expect(entity!.previousUserId).toBeNull();
    expect(entity!.mergeEvent).toMatchObject({
      userId: verified,
      actorType: "system",
      proofType: "forward_link",
      actorUserId: null,
    });
    expect(entity!.mergeEvent.reverseDeadline.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * The invariant, stated as a query rather than as prose: no registration is
   * owned without a ledger row explaining why. This is the one an operator
   * would run during an incident.
   */
  it("leaves no owned registration without a ledger row", async () => {
    const order = await makeOrder(`ver-${s}@t.test`);
    await applyForwardLink({ orderId: order.id, userId: verified, locale: "en" });

    const owned = await prisma.attendeeOrder.findMany({
      where: { eventMappingId: mappingId, userId: { not: null } },
      select: { id: true },
    });
    for (const o of owned) {
      const rows = await prisma.accountMergeEventEntity.count({ where: { entityId: o.id } });
      expect(rows).toBeGreaterThan(0);
    }
  });

  it("refuses to take ownership onto a staff account even if asked directly", async () => {
    const order = await makeOrder(`stf-${s}@t.test`);
    await applyForwardLink({ orderId: order.id, userId: staff, locale: "en" });
    // The shared path refuses it, and the registration simply stays unowned.
    expect((await prisma.attendeeOrder.findUnique({ where: { id: order.id } }))?.userId).toBeNull();
  });

  it("bookkeeping failure never propagates — a committed registration stays committed", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    (sendEmail as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("smtp down"));

    const order = await makeOrder(`ver-${s}@t.test`);
    await expect(
      applyForwardLink({ orderId: order.id, userId: verified, locale: "en" }),
    ).resolves.toBeUndefined();
  });

  /**
   * The poisoning case, with two registrations rather than one.
   *
   * The previous version of this test created a single order and linked it
   * once, which is what the test above already does — it would have passed
   * whether or not anything about shared mailboxes worked. On a shared mailbox
   * whoever verified the address first receives every LATER registration made
   * with it, which is an accepted decision as of 2026-09-06; what must hold is
   * that each one is recorded and notified separately.
   */
  it("a shared address takes a second person's registration too — each one recorded", async () => {
    const { sendEmail } = await import("@/lib/email/service");

    const first = await makeOrder(`ver-${s}@t.test`);
    const second = await makeOrder(`ver-${s}@t.test`); // a colleague, same mailbox

    for (const o of [first, second]) {
      expect(await resolveForwardLink(o.email)).toBe(verified);
      await applyForwardLink({ orderId: o.id, userId: verified, locale: "en" });
    }

    for (const o of [first, second]) {
      expect((await prisma.attendeeOrder.findUnique({ where: { id: o.id } }))?.userId).toBe(verified);
      expect(await prisma.accountMergeEventEntity.count({ where: { entityId: o.id } })).toBe(1);
    }

    // Two separate notices — never one silent second link.
    //
    // Counted by THIS test's order codes rather than by total calls: notices are
    // fire-and-forget, so a straggler from the previous case can land inside
    // this one and a global count is quietly flaky.
    await new Promise((r) => setTimeout(r, 150));
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const mine = calls.filter(([, meta]) =>
      [first.orderCode, second.orderCode].includes((meta as { attendeeRef: string }).attendeeRef),
    );
    expect(mine).toHaveLength(2);
  });
});
