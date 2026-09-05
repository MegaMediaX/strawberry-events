import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

/**
 * The ledger is the mitigation for a wrong merge — a second notification
 * channel was declined, so on the email-claim path the "was this you?" notice
 * lands in the mailbox the claimant already controls. That makes these
 * properties load-bearing rather than nice to have, and every one of them lives
 * at the storage layer: the transaction, the CHECK constraints, and the
 * previous-owner capture. Mocks would prove none of it.
 */
describe.skipIf(!run)("merge ledger (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let linkOrdersToUser: typeof import("@/lib/merge/ledger").linkOrdersToUser;
  let reverseMergeEvent: typeof import("@/lib/merge/ledger").reverseMergeEvent;
  let orderLinkHistory: typeof import("@/lib/merge/ledger").orderLinkHistory;

  const stamp = Date.now();
  let orgId = "";
  let mappingId = "";
  let attendeeId = "";
  let staffId = "";
  let operatorId = "";
  let orderA = "";
  let orderB = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ linkOrdersToUser, reverseMergeEvent, orderLinkHistory } = await import(
      "@/lib/merge/ledger"
    ));

    const org = await prisma.organization.create({
      data: {
        name: `ledger-org-${stamp}`,
        slug: `ledger-org-${stamp}`,
        pretixOrganizerSlug: `po${stamp}`,
      },
    });
    orgId = org.id;

    const mapping = await prisma.eventMapping.create({
      data: {
        organizationId: orgId,
        localEventId: `local-${stamp}`,
        titleEn: "Ledger Test Event",
        pretixOrganizerSlug: `po${stamp}`,
        pretixEventSlug: `e${stamp}`,
      },
    });
    mappingId = mapping.id;

    const attendee = await prisma.user.create({
      data: { email: `attendee-${stamp}@x.test`, passwordHash: "x" },
    });
    attendeeId = attendee.id;

    const operator = await prisma.user.create({
      data: { email: `operator-${stamp}@x.test`, passwordHash: "x" },
    });
    operatorId = operator.id;

    // A user who holds staff membership — links must never land here.
    const staff = await prisma.user.create({
      data: { email: `staff-${stamp}@x.test`, passwordHash: "x" },
    });
    staffId = staff.id;
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: staffId, role: "organizer_admin" },
    });
  });

  beforeEach(async () => {
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [attendeeId] } } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });

    const a = await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `A${stamp % 100000}`,
        email: `a-${stamp}@x.test`,
        attendeeName: "Rania Nassar",
        company: "Almayadeen",
        jobTitle: "Producer",
        roleTag: "speaker",
        pretixSecret: "SECRET-DO-NOT-TOUCH",
        magicLinkToken: `tok-a-${stamp}`,
      },
    });
    orderA = a.id;

    const b = await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `B${stamp % 100000}`,
        // No email at all — one of the 323. Manual linking MUST still work for
        // these; they are the population that can never self-claim.
        email: "",
        attendeeName: "Walk In",
        magicLinkToken: `tok-b-${stamp}`,
      },
    });
    orderB = b.id;
  });

  afterAll(async () => {
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId: attendeeId } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.eventMapping.delete({ where: { id: mappingId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [attendeeId, staffId, operatorId] } } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  const staffActor = { type: "staff_override" as const, userId: "", ip: "203.0.113.9" };

  it("writes userId and NOTHING else", async () => {
    const before = await prisma.attendeeOrder.findUnique({ where: { id: orderA } });

    await linkOrdersToUser({
      orderIds: [orderA],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "desk request",
    });

    const after = await prisma.attendeeOrder.findUnique({ where: { id: orderA } });

    // Whole-row comparison, not field-by-field: that is what catches a second
    // column being written. updatedAt is expected to move.
    expect({ ...after, updatedAt: null }).toEqual({ ...before, userId: attendeeId, updatedAt: null });
    expect(after?.pretixSecret).toBe("SECRET-DO-NOT-TOUCH");
    expect(after?.roleTag).toBe("speaker");
  });

  it("records where each order came from, so an un-merge is mechanical", async () => {
    const res = await linkOrdersToUser({
      orderIds: [orderA, orderB],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "two registrations, one person",
    });
    expect(res.ok).toBe(true);
    expect(res.linked).toBe(2);

    const entities = await prisma.accountMergeEventEntity.findMany({
      where: { mergeEventId: res.eventId! },
    });
    expect(entities).toHaveLength(2);
    // Unowned before, which is the normal first-claim case.
    expect(entities.every((e) => e.previousUserId === null)).toBe(true);
  });

  it("links an order with no email at all — the 323 depend on this", async () => {
    const res = await linkOrdersToUser({
      orderIds: [orderB],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "walk-in, identity checked at the desk",
    });
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderB } }))?.userId).toBe(attendeeId);
  });

  it("refuses to link onto an account that holds staff membership", async () => {
    const res = await linkOrdersToUser({
      orderIds: [orderA],
      userId: staffId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "should not happen",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/staff/i);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderA } }))?.userId).toBeNull();
  });

  it("reverses an event back to the previous owner and keeps the record", async () => {
    const link = await linkOrdersToUser({
      orderIds: [orderA, orderB],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "linked in error",
    });

    const rev = await reverseMergeEvent({
      eventId: link.eventId!,
      actor: { ...staffActor, userId: operatorId },
      reason: "wrong person",
    });
    expect(rev.ok).toBe(true);
    expect(rev.linked).toBe(2);

    for (const id of [orderA, orderB]) {
      expect((await prisma.attendeeOrder.findUnique({ where: { id } }))?.userId).toBeNull();
    }

    // Marked, not deleted — an audit trail the audited party can erase is not one.
    const event = await prisma.accountMergeEvent.findUnique({ where: { id: link.eventId! } });
    expect(event?.reversedAt).toBeInstanceOf(Date);
    expect(event?.reversedReason).toBe("wrong person");
    expect(await prisma.accountMergeEventEntity.count({ where: { mergeEventId: link.eventId! } })).toBe(2);
  });

  it("will not reverse the same event twice", async () => {
    const link = await linkOrdersToUser({
      orderIds: [orderA],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "x",
    });
    const a = { eventId: link.eventId!, actor: { ...staffActor, userId: operatorId }, reason: "r" };
    expect((await reverseMergeEvent(a)).ok).toBe(true);
    expect((await reverseMergeEvent(a)).ok).toBe(false);
  });

  it("does not yank back an order that has since moved elsewhere", async () => {
    const link = await linkOrdersToUser({
      orderIds: [orderA],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "first",
    });

    // Somebody else legitimately owns it now.
    await prisma.attendeeOrder.update({ where: { id: orderA }, data: { userId: operatorId } });

    await reverseMergeEvent({
      eventId: link.eventId!,
      actor: { ...staffActor, userId: operatorId },
      reason: "stale reversal",
    });

    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderA } }))?.userId).toBe(operatorId);
  });

  it("the database itself refuses an operator action with no reason", async () => {
    await expect(
      prisma.accountMergeEvent.create({
        data: {
          userId: attendeeId,
          actorType: "staff_override",
          actorUserId: operatorId,
          proofType: "admin_override",
          reason: null,
          reverseDeadline: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("the database itself refuses an unknown actorType", async () => {
    await expect(
      prisma.accountMergeEvent.create({
        data: {
          userId: attendeeId,
          actorType: "whatever",
          proofType: "admin_override",
          reverseDeadline: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("answers what has ever happened to one registration", async () => {
    const link = await linkOrdersToUser({
      orderIds: [orderA],
      userId: attendeeId,
      actor: { ...staffActor, userId: operatorId },
      proofType: "admin_override",
      reason: "desk",
    });
    await reverseMergeEvent({
      eventId: link.eventId!,
      actor: { ...staffActor, userId: operatorId },
      reason: "undo",
    });

    const history = await orderLinkHistory(orderA);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      linkedToUserId: attendeeId,
      actorType: "staff_override",
      actorUserId: operatorId,
      proofType: "admin_override",
      reason: "desk",
      reversedReason: "undo",
    });
    expect(history[0].reversible).toBe(false);
  });
});
