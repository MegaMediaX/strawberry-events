import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

const run = Boolean(process.env.TEST_DATABASE_URL);

/**
 * These screens are the only way an operator can change who owns a
 * registration, so the guards around them are the feature. Everything here is
 * about who may act and on whose data — not about whether the link works, which
 * ledger.integration.test.ts already covers.
 */
describe.skipIf(!run)("merge admin (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let admin: typeof import("@/lib/merge/admin");

  const s = Date.now();
  let orgA = "", orgB = "", mapA = "", mapB = "";
  let attendee = "", adminA = "", financeA = "", adminB = "";
  let orderInA = "", orderInB = "";

  const session = (userId: string, orgId: string, role: string, over: Partial<SessionContext> = {}): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [{ organizationId: orgId, role, assignedEventIds: [] }] as never,
    ...over,
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    admin = await import("@/lib/merge/admin");

    const a = await prisma.organization.create({
      data: { name: `A${s}`, slug: `a${s}`, pretixOrganizerSlug: `pa${s}` },
    });
    const b = await prisma.organization.create({
      data: { name: `B${s}`, slug: `b${s}`, pretixOrganizerSlug: `pb${s}` },
    });
    orgA = a.id; orgB = b.id;

    mapA = (await prisma.eventMapping.create({
      data: { organizationId: orgA, localEventId: `la${s}`, titleEn: "Event A", pretixOrganizerSlug: `pa${s}`, pretixEventSlug: `ea${s}` },
    })).id;
    mapB = (await prisma.eventMapping.create({
      data: { organizationId: orgB, localEventId: `lb${s}`, titleEn: "Event B", pretixOrganizerSlug: `pb${s}`, pretixEventSlug: `eb${s}` },
    })).id;

    attendee = (await prisma.user.create({ data: { email: `att-${s}@t.test`, passwordHash: "x" } })).id;
    adminA = (await prisma.user.create({ data: { email: `adma-${s}@t.test`, passwordHash: "x" } })).id;
    financeA = (await prisma.user.create({ data: { email: `fin-${s}@t.test`, passwordHash: "x" } })).id;
    adminB = (await prisma.user.create({ data: { email: `admb-${s}@t.test`, passwordHash: "x" } })).id;
  });

  beforeEach(async () => {
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: { in: [mapA, mapB] } } });
    await prisma.accountMergeEvent.deleteMany({ where: { userId: attendee } });
    orderInA = (await prisma.attendeeOrder.create({
      data: { eventMappingId: mapA, orderCode: `OA${s % 10000}`, email: `oa-${s}@t.test`, magicLinkToken: `ta-${s}-${Math.random()}` },
    })).id;
    orderInB = (await prisma.attendeeOrder.create({
      data: { eventMappingId: mapB, orderCode: `OB${s % 10000}`, email: `ob-${s}@t.test`, magicLinkToken: `tb-${s}-${Math.random()}` },
    })).id;
  });

  afterAll(async () => {
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: { in: [mapA, mapB] } } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId: attendee } }).catch(() => {});
    await prisma.eventMapping.deleteMany({ where: { id: { in: [mapA, mapB] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [attendee, adminA, financeA, adminB] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } }).catch(() => {});
  });

  it("an organiser can see and link a registration in their own org", async () => {
    const ses = session(adminA, orgA, "organizer_admin");
    expect(await admin.getOrderForOperator(ses, orderInA)).not.toBeNull();

    const res = await admin.linkOrderByEmail(ses, {
      orderId: orderInA,
      email: `att-${s}@t.test`,
      reason: "checked at the desk",
    });
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderInA } }))?.userId).toBe(attendee);
  });

  /** Another organiser's attendee is not theirs to see, let alone to move. */
  it("cannot see or link a registration belonging to another organisation", async () => {
    const ses = session(adminA, orgA, "organizer_admin");
    expect(await admin.getOrderForOperator(ses, orderInB)).toBeNull();

    const res = await admin.linkOrderByEmail(ses, {
      orderId: orderInB,
      email: `att-${s}@t.test`,
      reason: "should not work",
    });
    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderInB } }))?.userId).toBeNull();
  });

  /**
   * finance can open /admin, so "is an admin user" is not the same question as
   * "may re-own a registration". checkin_staff is further still from it.
   */
  it("refuses roles that can open /admin but have no business re-owning", async () => {
    for (const role of ["finance", "workshop_organiser", "checkin_staff"]) {
      const ses = session(financeA, orgA, role);
      await expect(admin.getOrderForOperator(ses, orderInA)).rejects.toThrow(/not allowed/i);
    }
  });

  /**
   * The ledger records an operator id. Under impersonation that id names the
   * account being impersonated, so the record would be right about the account
   * and wrong about the human — the one thing an audit trail cannot be.
   */
  it("refuses while impersonating, even for a full organiser", async () => {
    const ses = session(adminA, orgA, "organizer_admin", { impersonating: true });
    await expect(admin.getOrderForOperator(ses, orderInA)).rejects.toThrow(/impersonat/i);
  });

  it("unlink reverses the event that made the link, rather than inventing a new story", async () => {
    const ses = session(adminA, orgA, "organizer_admin");
    await admin.linkOrderByEmail(ses, { orderId: orderInA, email: `att-${s}@t.test`, reason: "link" });

    const res = await admin.unlinkOrder(ses, { orderId: orderInA, reason: "wrong person" });
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderInA } }))?.userId).toBeNull();

    // One event, now marked reversed — not two events telling half a story each.
    const events = await prisma.accountMergeEvent.findMany({ where: { userId: attendee } });
    expect(events).toHaveLength(1);
    expect(events[0].reversedAt).toBeInstanceOf(Date);
    expect(events[0].reversedReason).toBe("wrong person");
  });

  it("records a detach even when there is no event to reverse", async () => {
    // A link made before this ledger existed.
    await prisma.attendeeOrder.update({ where: { id: orderInA }, data: { userId: attendee } });

    const ses = session(adminA, orgA, "organizer_admin");
    const res = await admin.unlinkOrder(ses, { orderId: orderInA, reason: "legacy link" });
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderInA } }))?.userId).toBeNull();

    // The history must still show where it went, rather than the order simply
    // becoming unowned with nothing to explain it.
    const history = await admin.getOrderForOperator(ses, orderInA);
    expect(history?.history).toHaveLength(1);
    expect(history?.history[0].previousUserId).toBe(attendee);
  });

  it("the ledger screen shows only events touching this organiser's registrations", async () => {
    const sesA = session(adminA, orgA, "organizer_admin");
    const sesB = session(adminB, orgB, "organizer_admin");

    await admin.linkOrderByEmail(sesA, { orderId: orderInA, email: `att-${s}@t.test`, reason: "A" });
    await admin.linkOrderByEmail(sesB, { orderId: orderInB, email: `att-${s}@t.test`, reason: "B" });

    const listA = await admin.listMergeEvents(sesA);
    expect(listA).toHaveLength(1);
    expect(listA[0].orders[0].id).toBe(orderInA);
    // The other organiser's reason and actor address must not appear here.
    expect(JSON.stringify(listA)).not.toContain("admb-");
    expect(JSON.stringify(listA)).not.toContain(`"B"`);
  });

  it("cannot reverse another organisation's event from the ledger screen", async () => {
    const sesB = session(adminB, orgB, "organizer_admin");
    await admin.linkOrderByEmail(sesB, { orderId: orderInB, email: `att-${s}@t.test`, reason: "B" });
    const eventB = (await prisma.accountMergeEvent.findFirst({ orderBy: { createdAt: "desc" } }))!;

    const sesA = session(adminA, orgA, "organizer_admin");
    const res = await admin.reverseFromLedger(sesA, { eventId: eventB.id, reason: "not mine" });
    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderInB } }))?.userId).toBe(attendee);
  });
});
