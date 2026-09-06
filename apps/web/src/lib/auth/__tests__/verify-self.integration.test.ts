import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

/**
 * Verifying your own address from /profile.
 *
 * The property that distinguishes this from the signup path: the address comes
 * from the SESSION, never from the caller. Signup must answer neutrally because
 * it accepts a typed address and would otherwise be a membership oracle; here
 * there is nothing to probe, so the tests are about the code being bound to the
 * right account rather than about neutrality.
 */
describe.skipIf(!run)("verify my own email (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ev: typeof import("@/lib/auth/email-verification");

  const s = Date.now();
  let mine = "", theirs = "", already = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ev = await import("@/lib/auth/email-verification");

    mine = (await prisma.user.create({
      data: { email: `mine-${s}@t.test`, passwordHash: "x", emailVerified: null },
    })).id;
    theirs = (await prisma.user.create({
      data: { email: `theirs-${s}@t.test`, passwordHash: "x", emailVerified: null },
    })).id;
    already = (await prisma.user.create({
      data: { email: `done-${s}@t.test`, passwordHash: "x", emailVerified: new Date() },
    })).id;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { __resetRateLimits } = await import("@/lib/security/rate-limit");
    __resetRateLimits();
    await prisma.emailVerificationCode.deleteMany({ where: { userId: { in: [mine, theirs, already] } } });
    // Verification state has to be reset too: the first case verifies `mine`,
    // and resendVerificationCode correctly refuses an already-verified account,
    // so every later case would silently get no code at all.
    await prisma.user.updateMany({ where: { id: { in: [mine, theirs] } }, data: { emailVerified: null } });
    await prisma.user.update({ where: { id: already }, data: { emailVerified: new Date() } });
  });

  afterAll(async () => {
    await prisma.emailVerificationCode.deleteMany({ where: { userId: { in: [mine, theirs, already] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [mine, theirs, already] } } }).catch(() => {});
  });

  /** Reading the code out of the mail is how a real user gets it. */
  async function issueAndRead(email: string): Promise<string> {
    const { sendEmail } = await import("@/lib/email/service");
    await ev.resendVerificationCode(email);
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const text = (calls.at(-1)![0] as { text: string }).text;
    return text.match(/\b(\d{6})\b/)![1];
  }

  it("verifies the account the code was issued for", async () => {
    const code = await issueAndRead(`mine-${s}@t.test`);
    const res = await ev.checkVerificationCode(`mine-${s}@t.test`, code);

    expect(res.ok).toBe(true);
    const user = await prisma.user.findUnique({ where: { id: mine } });
    expect(user?.emailVerified).toBeInstanceOf(Date);
  });

  /**
   * The property that matters most here: codes are looked up by address, so a
   * code issued for one account must be worthless against another. Without
   * this, anyone could request a code for their own account and submit it
   * while claiming to be someone else.
   */
  it("a code issued for one account cannot verify another", async () => {
    const mineCode = await issueAndRead(`mine-${s}@t.test`);

    const res = await ev.checkVerificationCode(`theirs-${s}@t.test`, mineCode);
    expect(res.ok).toBe(false);

    const other = await prisma.user.findUnique({ where: { id: theirs } });
    expect(other?.emailVerified).toBeNull();
  });

  it("issues nothing for an account that is already verified", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    await ev.resendVerificationCode(`done-${s}@t.test`);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a fresh code supersedes the previous one", async () => {
    const first = await issueAndRead(`mine-${s}@t.test`);
    const second = await issueAndRead(`mine-${s}@t.test`);
    expect(second).not.toBe(first);

    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, first)).ok).toBe(false);
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, second)).ok).toBe(true);
  });

  /**
   * Shares the per-address budget with signup, so this route cannot be used to
   * mail someone more often than signing up already could.
   */
  it("is capped on the same budget as signup mail", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    for (let i = 0; i < 3; i += 1) await ev.resendVerificationCode(`mine-${s}@t.test`);
    expect((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(3);

    await ev.resendVerificationCode(`mine-${s}@t.test`);
    expect((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(3);
  });
});
