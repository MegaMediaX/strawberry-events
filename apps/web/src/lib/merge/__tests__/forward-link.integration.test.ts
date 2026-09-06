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
  let recordForwardLink: typeof import("@/lib/merge/forward-link").recordForwardLink;

  const s = Date.now();
  let orgId = "", mappingId = "";
  let verified = "", unverified = "", suspended = "", staff = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ resolveForwardLink, recordForwardLink } = await import("@/lib/merge/forward-link"));

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
  it("records a ledger event and notifies, exactly like a claim", async () => {
    const order = await makeOrder(`ver-${s}@t.test`);
    await prisma.attendeeOrder.update({ where: { id: order.id }, data: { userId: verified } });

    await recordForwardLink({ orderId: order.id, userId: verified, locale: "en" });

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
    // Reversible on the same terms as any other link.
    expect(entity!.mergeEvent.reverseDeadline.getTime()).toBeGreaterThan(Date.now());

    const { sendEmail } = await import("@/lib/email/service");
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const [msg, meta] = calls[0] as [{ to: string }, { templateType: string }];
    expect(msg.to).toBe(`ver-${s}@t.test`);
    expect(meta.templateType).toBe("registration_claimed");
  });

  it("bookkeeping failure never propagates — a committed registration stays committed", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    (sendEmail as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("smtp down"));

    const order = await makeOrder(`ver-${s}@t.test`);
    await expect(
      recordForwardLink({ orderId: order.id, userId: verified, locale: "en" }),
    ).resolves.toBeUndefined();
  });

  /**
   * The poisoning case. On a shared mailbox, whoever verified the address first
   * receives every colleague's future registration — silently, were it not for
   * the ledger row and the notice. Shared-mailbox merging is an accepted
   * decision; this asserts it is at least always recorded.
   */
  it("a shared address links a colleague's registration too — and says so", async () => {
    const colleague = await makeOrder(`ver-${s}@t.test`);
    const owner = await resolveForwardLink(colleague.email);
    expect(owner).toBe(verified);

    await prisma.attendeeOrder.update({ where: { id: colleague.id }, data: { userId: owner! } });
    await recordForwardLink({ orderId: colleague.id, userId: owner!, locale: "en" });

    const events = await prisma.accountMergeEventEntity.count({ where: { entityId: colleague.id } });
    expect(events).toBe(1);
    const { sendEmail } = await import("@/lib/email/service");
    expect((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
  });
});
