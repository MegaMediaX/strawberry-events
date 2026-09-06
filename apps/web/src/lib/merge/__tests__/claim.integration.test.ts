import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";
import type { MemberRole } from "@prisma/client";

const run = Boolean(process.env.TEST_DATABASE_URL);

// The claim now notifies the address on the registration. Mocked so these
// tests assert WHAT is sent rather than exercising SMTP.
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

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
    vi.clearAllMocks();
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

  /**
   * The notice CLAUDE.md already assumed existed.
   *
   * It goes to the address on the REGISTRATION, not to the claimant — the whole
   * point is to reach the person the ticket was mailed to, who may not be the
   * person who just clicked. Ticket links never expire, so a forwarded
   * confirmation opened months later is the realistic case, and without this
   * mail nobody is told.
   */
  it("tells the address on the registration that it was claimed", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const mock = sendEmail as unknown as { mock: { calls: unknown[][] } };

    await claimOrderFromToken(session(me), token);

    const [msg, meta] = mock.mock.calls.at(-1) as [
      { to: string; subject: string; text: string },
      { templateType: string },
    ];
    expect(msg.to).toBe(`holder-${s}@t.test`);
    expect(meta.templateType).toBe("registration_claimed");
    expect(msg.subject).toContain(orderCode);

    // The claiming address is masked: recognisable to its owner, not reusable
    // by whoever else reads that mailbox.
    expect(msg.text).not.toContain(`me-${s}@t.test`);
    expect(msg.text).toMatch(/•••/);
  });

  it("a failed notice does not fail the claim", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    (sendEmail as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error("smtp down"));

    const res = await claimOrderFromToken(session(me), token);
    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBe(me);
  });

  /**
   * The seam between the operator screens and this path.
   *
   * Unlinking sets userId back to null and deliberately does NOT revoke the
   * ticket link — revoking would cost that person entry, and a privacy action
   * must never do that. But that leaves the ownership gate satisfied again, so
   * without this rule the same visitor could click Save once more and put the
   * registration straight back, logged as an ordinary first claim. An
   * organiser's decision would be reversible by the person it was used against.
   */
  it("refuses to re-claim a registration an organiser has unlinked", async () => {
    const { reverseMergeEvent } = await import("@/lib/merge/ledger");

    const first = await claimOrderFromToken(session(me), token);
    expect(first.ok).toBe(true);

    const event = await prisma.accountMergeEvent.findFirst({ where: { userId: me } });
    await reverseMergeEvent({
      eventId: event!.id,
      actor: { type: "staff_override", userId: staff },
      reason: "not this person's registration",
    });
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();

    // Same token, same person, one click later.
    const again = await claimOrderFromToken(session(me), token);
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/organiser/i);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();
  });
});
