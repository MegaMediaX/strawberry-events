import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

/**
 * Verifying an address claims the registrations already sitting under it.
 *
 * The linking mechanics belong to ledger.integration.test.ts; what is tested
 * here is the SELECTION — which registrations a proved address is allowed to
 * take, and which it must leave alone.
 */
describe.skipIf(!run)("claim on verify (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let claimOrdersForVerifiedEmail: typeof import("@/lib/merge/claim-on-verify").claimOrdersForVerifiedEmail;
  let SWEEP_LIMIT = 0;
  let linkOrdersToUser: typeof import("@/lib/merge/ledger").linkOrdersToUser;

  const s = Date.now();
  let orgId = "", mappingId = "", me = "", rival = "";
  const mine = `sweep-${s}@t.test`;

  const mkOrder = async (over: Record<string, unknown> = {}) =>
    (await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `SW${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        email: mine,
        magicLinkToken: `tok-${Math.random().toString(36).slice(2)}`,
        ...over,
      },
    })).id;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ claimOrdersForVerifiedEmail, SWEEP_LIMIT } = await import("@/lib/merge/claim-on-verify"));
    ({ linkOrdersToUser } = await import("@/lib/merge/ledger"));

    orgId = (await prisma.organization.create({
      data: { name: `S${s}`, slug: `s${s}`, pretixOrganizerSlug: `ps${s}` },
    })).id;
    mappingId = (await prisma.eventMapping.create({
      data: { organizationId: orgId, localEventId: `ls${s}`, titleEn: "Sweep Event", pretixOrganizerSlug: `ps${s}`, pretixEventSlug: `es${s}` },
    })).id;
    me = (await prisma.user.create({ data: { email: mine, passwordHash: "x", emailVerified: new Date() } })).id;
    rival = (await prisma.user.create({ data: { email: `rival-${s}@t.test`, passwordHash: "x" } })).id;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.accountMergeEventEntity.deleteMany({
      where: { mergeEvent: { userId: { in: [me, rival] } } },
    });
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [me, rival] } } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
  });

  afterAll(async () => {
    await prisma.accountMergeEventEntity.deleteMany({ where: { mergeEvent: { userId: { in: [me, rival] } } } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [me, rival] } } }).catch(() => {});
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } }).catch(() => {});
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [me, rival] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  });

  it("links every unowned registration under the proved address", async () => {
    const a = await mkOrder();
    const b = await mkOrder();

    const res = await claimOrdersForVerifiedEmail({ userId: me, email: mine });

    expect(res.linked).toBe(2);
    const rows = await prisma.attendeeOrder.findMany({
      where: { id: { in: [a, b] } },
      select: { id: true, userId: true },
    });
    expect(rows.every((r) => r.userId === me)).toBe(true);
  });

  /**
   * The guard that makes an address-match safe to act on.
   *
   * Matching on an address is evidence about the MAILBOX, not the person, and
   * 33 addresses in the live table hold registrations for more than one human.
   * A sweep that took owned rows would let whoever verifies second quietly take
   * what the first had already claimed.
   */
  it("refuses to take a registration another account already owns", async () => {
    const theirs = await mkOrder({ userId: rival });
    const free = await mkOrder();

    const res = await claimOrdersForVerifiedEmail({ userId: me, email: mine });

    expect(res.linked).toBe(1);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: theirs } }))?.userId).toBe(rival);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: free } }))?.userId).toBe(me);
  });

  /**
   * One event, so reversing puts the address back exactly as it was. A
   * per-order loop could not promise that: a failure halfway would leave some
   * linked and some not, with no single record of the intent.
   */
  it("records the whole sweep as ONE ledger event with one entity per registration", async () => {
    await mkOrder();
    await mkOrder();
    await mkOrder();

    await claimOrdersForVerifiedEmail({ userId: me, email: mine });

    const events = await prisma.accountMergeEvent.findMany({
      where: { userId: me },
      include: { entities: true },
    });
    expect(events).toHaveLength(1);
    expect(events[0].entities).toHaveLength(3);
    expect(events[0].proofType).toBe("email_code");
    expect(events[0].matchRule).toBe("verified_email");
    expect(events[0].actorType).toBe("self_claim");
  });

  it("sends ONE notice listing them, not one mail per registration", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const one = await prisma.attendeeOrder.findUnique({ where: { id: await mkOrder() } });
    await mkOrder();

    await claimOrdersForVerifiedEmail({ userId: me, email: mine });

    /**
     * Polled, not slept on. The notice is scheduled off the response path, so
     * a fixed timer here would be a race: any await later added inside
     * notifyClaimed could push it past the deadline and fail CI with no code
     * regression behind it.
     */
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    await vi.waitFor(() => expect(calls.length).toBe(1));
    const sent = calls[0][0] as { to: string; subject: string; text: string };
    expect(sent.to).toBe(mine);
    expect(sent.subject).toMatch(/2 registrations/i);
    expect(sent.text).toContain(one!.orderCode);
  });

  it("does nothing, and says nothing, when the address has no registrations", async () => {
    const { sendEmail } = await import("@/lib/email/service");

    const res = await claimOrdersForVerifiedEmail({ userId: me, email: `nothing-${s}@t.test` });

    expect(res.linked).toBe(0);
    expect(await prisma.accountMergeEvent.count({ where: { userId: me } })).toBe(0);
    expect((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });

  it("matches the address case-insensitively, as every other lookup does", async () => {
    const a = await mkOrder();

    const res = await claimOrdersForVerifiedEmail({ userId: me, email: `  ${mine.toUpperCase()}  ` });

    expect(res.linked).toBe(1);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: a } }))?.userId).toBe(me);
  });

  /**
   * The guard has to live UNDER THE LOCK, not in the caller.
   *
   * claimOrdersForVerifiedEmail narrows candidates with `userId: null`, but that
   * read takes no lock — an order claimed between it and the transaction would
   * still arrive here with an owner. So this calls the ledger directly with an
   * owned id, which is exactly the state that race produces, and asserts the
   * ledger itself refuses. Filtering in the caller cannot make this test pass.
   */
  it("the ledger refuses a self-claim on an owned registration, whatever the caller filtered", async () => {
    const theirs = await mkOrder({ userId: rival });

    const res = await linkOrdersToUser({
      orderIds: [theirs],
      userId: me,
      actor: { type: "self_claim" },
      proofType: "email_code",
      matchRule: "verified_email",
    });

    expect(res.ok).toBe(false);
    expect(res.linked).toBe(0);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: theirs } }))?.userId).toBe(rival);
    // and it left no ledger event behind claiming otherwise
    expect(await prisma.accountMergeEvent.count({ where: { userId: me } })).toBe(0);
  });

  /**
   * Registration takes a typed address, so rows can be stacked under someone
   * else's mailbox before they ever verify. The cap stops one verification
   * becoming an unbounded locked transaction and a mail listing all of them.
   */
  it("links at most SWEEP_LIMIT, oldest first, leaving the rest claimable", async () => {
    const base = Date.now() - 1000 * 60 * 60 * 24;
    await prisma.attendeeOrder.createMany({
      data: Array.from({ length: SWEEP_LIMIT + 5 }, (_, i) => ({
        eventMappingId: mappingId,
        orderCode: `CAP${i}-${s}`,
        email: mine,
        magicLinkToken: `capt-${i}-${s}`,
        createdAt: new Date(base + i * 1000),
      })),
    });

    const res = await claimOrdersForVerifiedEmail({ userId: me, email: mine });

    expect(res.linked).toBe(SWEEP_LIMIT);
    // The five newest are the ones left behind — a flood cannot displace the
    // genuine older registrations.
    const left = await prisma.attendeeOrder.findMany({
      where: { email: mine, userId: null },
      orderBy: { createdAt: "asc" },
      select: { orderCode: true },
    });
    expect(left).toHaveLength(5);
    expect(left[0].orderCode).toBe(`CAP${SWEEP_LIMIT}-${s}`);
  });
});
