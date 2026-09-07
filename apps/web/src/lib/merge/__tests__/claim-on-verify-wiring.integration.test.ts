import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** A cookie jar and headers the actions can actually read. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
}));

let sessionUserId = "";
vi.mock("@/lib/auth/session", () => ({
  getSessionContext: async () =>
    sessionUserId ? { userId: sessionUserId, isSuperAdmin: false, memberships: [] } : null,
}));

/**
 * That the verify ACTIONS actually run the sweep.
 *
 * claim-on-verify.integration.test.ts proves the sweep does the right thing
 * when called. Nothing proved it was called: delete both call sites and every
 * test in the repo still passed. That is the same shape as the bug this whole
 * change fixes — the linking code existed and nothing invoked it — so it is
 * worth a test that fails when the wire is cut, not a promise to check
 * production afterwards.
 */
describe.skipIf(!run)("verify actions run the claim sweep (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;

  const s = Date.now();
  let orgId = "", mappingId = "", userId = "";
  const addr = `wire-${s}@t.test`;

  const codeFromLastMail = async (): Promise<string> => {
    const { sendEmail } = await import("@/lib/email/service");
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    return ((calls.at(-1)![0] as { text: string }).text.match(/\b(\d{6})\b/) ?? [])[1];
  };

  const seedOrder = async () =>
    (await prisma.attendeeOrder.create({
      data: {
        eventMappingId: mappingId,
        orderCode: `WR${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        email: addr,
        magicLinkToken: `wt-${Math.random().toString(36).slice(2)}`,
      },
    })).id;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));

    orgId = (await prisma.organization.create({
      data: { name: `W${s}`, slug: `w${s}`, pretixOrganizerSlug: `pw${s}` },
    })).id;
    mappingId = (await prisma.eventMapping.create({
      data: { organizationId: orgId, localEventId: `lw${s}`, titleEn: "Wire Event", pretixOrganizerSlug: `pw${s}`, pretixEventSlug: `ew${s}` },
    })).id;
    userId = (await prisma.user.create({
      data: { email: addr, passwordHash: "x", emailVerified: null },
    })).id;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    jar.clear();
    sessionUserId = "";
    const { __resetRateLimits } = await import("@/lib/security/rate-limit");
    __resetRateLimits();
    await prisma.accountMergeEventEntity.deleteMany({ where: { mergeEvent: { userId } } });
    await prisma.accountMergeEvent.deleteMany({ where: { userId } });
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } });
    await prisma.emailVerificationCode.deleteMany({ where: { email: addr } });
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });
  });

  afterAll(async () => {
    await prisma.accountMergeEventEntity.deleteMany({ where: { mergeEvent: { userId } } }).catch(() => {});
    await prisma.accountMergeEvent.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.attendeeOrder.deleteMany({ where: { eventMappingId: mappingId } }).catch(() => {});
    await prisma.emailVerificationCode.deleteMany({ where: { email: addr } }).catch(() => {});
    await prisma.eventMapping.deleteMany({ where: { id: mappingId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  });

  it("the signup verify action links the address's registrations", async () => {
    const { resendCodeAction, verifyEmailAction } = await import("@/app/[locale]/(auth)/register/actions");
    const orderId = await seedOrder();

    await resendCodeAction({ email: addr, locale: "en" });
    const code = await codeFromLastMail();

    const res = await verifyEmailAction({ email: addr, code, locale: "en" });

    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBe(userId);
    expect(await prisma.accountMergeEvent.count({ where: { userId } })).toBe(1);
  });

  it("the profile verify action links them too", async () => {
    const { sendMyVerificationCode, verifyMyEmail } = await import("@/app/[locale]/(public)/profile/verify-actions");
    const orderId = await seedOrder();
    sessionUserId = userId;

    await sendMyVerificationCode("en");
    const code = await codeFromLastMail();

    const res = await verifyMyEmail("en", code);

    expect(res.ok).toBe(true);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBe(userId);
    expect(await prisma.accountMergeEvent.count({ where: { userId } })).toBe(1);
  });

  it("a rejected code links nothing", async () => {
    const { resendCodeAction, verifyEmailAction } = await import("@/app/[locale]/(auth)/register/actions");
    const orderId = await seedOrder();
    await resendCodeAction({ email: addr, locale: "en" });

    const res = await verifyEmailAction({ email: addr, code: "000000", locale: "en" });

    expect(res.ok).toBe(false);
    expect((await prisma.attendeeOrder.findUnique({ where: { id: orderId } }))?.userId).toBeNull();
    expect(await prisma.accountMergeEvent.count({ where: { userId } })).toBe(0);
  });
});
