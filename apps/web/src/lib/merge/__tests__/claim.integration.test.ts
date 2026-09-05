import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";
import type { MemberRole } from "@prisma/client";

const run = Boolean(process.env.TEST_DATABASE_URL);

/**
 * The claim path where the token is the whole proof. Everything here is about
 * what the token does and does not authorise — the linking mechanics are
 * already covered by ledger.integration.test.ts.
 */
describe.skipIf(!run)("claim from a ticket link (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let claimOrderFromToken: typeof import("@/lib/merge/claim").claimOrderFromToken;
  let signMagicLink: typeof import("@/lib/tokens/magic-link").signMagicLink;

  const s = Date.now();
  let orgId = "", mappingId = "", me = "", other = "", staff = "";
  let orderId = "", orderCode = "", token = "";
  let blankOrderId = "", blankToken = "";

  const session = (userId: string): SessionContext => ({
    userId,
    isSuperAdmin: false,
    memberships: [],
  });

  beforeAll(async () => {
    process.env.MAGIC_LINK_SECRET = "claim-test-secret";
    ({ prisma } = await import("@/lib/db/client"));
    ({ claimOrderFromToken } = await import("@/lib/merge/claim"));
    ({ signMagicLink } = await import("@/lib/tokens/magic-link"));

    orgId = (await prisma.organization.create({
      data: { name: `C${s}`, slug: `c${s}`, pretixOrganizerSlug: `pc${s}` },
    })).id;
    mappingId = (await prisma.eventMapping.create({
      data: { organizationId: orgId, localEventId: `lc${s}`, titleEn: "Claim Event", pretixOrganizerSlug: `pc${s}`, pretixEventSlug: `ec${s}` },
    })).id;
    me = (await prisma.user.create({ data: { email: `me-${s}@t.test`, passwordHash: "x" } })).id;
    other = (await prisma.user.create({ data: { email: `other-${s}@t.test`, passwordHash: "x" } })).id;
    staff = (await prisma.user.create({ data: { email: `staff-${s}@t.test`, passwordHash: "x" } })).id;
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: staff, role: "organizer_admin" as MemberRole },
    });
  });

  beforeEach(async () => {
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [me, other, staff] } } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });

    orderCode = `CL${s % 100000}`;
    token = signMagicLink(orderCode);
    orderId = (await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId, orderCode, email: `holder-${s}@t.test`,
        attendeeName: "Ticket Holder", roleTag: "speaker",
        pretixSecret: "QR-SECRET", magicLinkToken: token,
      },
    })).id;

    const blankCode = `BL${s % 100000}`;
    blankToken = signMagicLink(blankCode);
    blankOrderId = (await prisma.attendeeOrder.create({
      data: { eventMappingId: mappingId, orderCode: blankCode, email: "", magicLinkToken: blankToken },
    })).id;
  });

  afterAll(async () => {
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId: { in: [me, other, staff] } } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.eventMapping.delete({ where: { id: mappingId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [me, other, staff] } } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("a valid token claims the registration and records why", async () => {
    const res = await claimOrderFromToken(session(me), token, "203.0.113.1");
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBe(me);

    const event = await prisma.accountMergeEvent.findFirst({ where: { userId: me } });
    expect(event).toMatchObject({
      actorType: "self_claim",
      proofType: "magic_link",
      matchRule: "token",
      actorUserId: null,
    });
    // A self-claim carries no operator and needs no reason — the DB constraint
    // only demands those of staff_override.
    expect(event?.reason).toBeNull();
  });

  it("writes userId and nothing else — the badge must not change", async () => {
    const before = await prisma.attendeeOrder.findUnique({ where: { id: orderId } });
    await claimOrderFromToken(session(me), token);
    const after = await prisma.attendeeOrder.findUnique({ where: { id: orderId } });

    expect({ ...after, updatedAt: null }).toEqual({ ...before, userId: me, updatedAt: null });
    expect(after?.pretixSecret).toBe("QR-SECRET");
    expect(after?.roleTag).toBe("speaker");
  });

  /** A forged or tampered token must be worth nothing, and say nothing. */
  it("refuses a tampered token, and answers the same way as an unknown one", async () => {
    const tampered = await claimOrderFromToken(session(me), `${token}x`);
    const unknown = await claimOrderFromToken(session(me), signMagicLink("NOSUCH"));

    expect(tampered.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    expect(tampered.error).toBe(unknown.error);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();
  });

  /**
   * Revocation is the kill switch for a leaked ticket email. A link that no
   * longer opens the ticket must not still be able to claim it.
   */
  it("refuses a revoked link", async () => {
    await prisma.attendeeOrder.update({
      where: { id: orderId },
      data: { magicLinkRevokedAt: new Date() },
    });
    const res = await claimOrderFromToken(session(me), token);
    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();
  });

  it("refuses a link whose version has been rotated past", async () => {
    await prisma.attendeeOrder.update({ where: { id: orderId }, data: { magicLinkVersion: 1 } });
    const res = await claimOrderFromToken(session(me), token);
    expect(res.ok).toBe(false);
  });

  /**
   * Holding the URL is not a reason to take a registration off somebody else —
   * that is the move the ledger exists to catch, and it belongs to an operator
   * who has to give a reason for it.
   */
  it("will not take a registration that already belongs to another account", async () => {
    await prisma.attendeeOrder.update({ where: { id: orderId }, data: { userId: other } });
    const res = await claimOrderFromToken(session(me), token);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/another account/i);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBe(other);
  });

  it("says so plainly when it is already yours, and does not write a second event", async () => {
    await claimOrderFromToken(session(me), token);
    const again = await claimOrderFromToken(session(me), token);

    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already/i);
    expect(await prisma.accountMergeEvent.count({ where: { userId: me } })).toBe(1);
  });

  /** Attendees and staff share one users table; a claim must not cross that line. */
  it("refuses to claim onto an account holding staff membership", async () => {
    const res = await claimOrderFromToken(session(staff), token);
    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();
  });

  /**
   * The 323 registrations with no email were never sent a link, so nobody
   * legitimately holds one. The self-claim guard in the ledger refuses them and
   * this covers that it reaches this path too.
   */
  it("refuses a registration that has no email, even with a valid token", async () => {
    const res = await claimOrderFromToken(session(me), blankToken);
    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: blankOrderId } }))?.userId).toBeNull();
  });
});
