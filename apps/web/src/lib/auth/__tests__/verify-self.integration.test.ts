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

  /**
   * Reading the code out of the mail is how a real user gets it — and the flow
   * token is what their browser holds from having asked. Both are needed now:
   * a guess without the flow is refused so a stranger cannot spend the
   * attempts, which is the point of the binding.
   */
  async function issueAndRead(email: string): Promise<{ code: string; flow: string }> {
    const { sendEmail } = await import("@/lib/email/service");
    const flow = ev.newFlowToken().token;
    await ev.resendVerificationCode(email, "en", flow);
    const calls = (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const text = (calls.at(-1)![0] as { text: string }).text;
    return { code: text.match(/\b(\d{6})\b/)![1], flow };
  }

  it("verifies the account the code was issued for", async () => {
    const { code, flow } = await issueAndRead(`mine-${s}@t.test`);
    const res = await ev.checkVerificationCode(`mine-${s}@t.test`, code, flow);

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
    const { code: mineCode, flow } = await issueAndRead(`mine-${s}@t.test`);

    // Even holding the flow for their OWN request, it is worthless against
    // another account's code.
    const res = await ev.checkVerificationCode(`theirs-${s}@t.test`, mineCode, flow);
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
    expect(second.code).not.toBe(first.code);

    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, first.code, first.flow)).ok).toBe(false);
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, second.code, second.flow)).ok).toBe(true);
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

  /**
   * The attack this exists to stop.
   *
   * `verifyEmailAction` is unauthenticated and takes a caller-supplied address,
   * so anyone who knew an address could submit five wrong codes and spend the
   * live code's attempts. Burning cost five cheap requests; recovering cost the
   * owner a mail from a 3/hour budget — the attacker won that race every time,
   * indefinitely.
   *
   * A guess without the flow token is now refused WITHOUT consuming an attempt,
   * so the counter can only ever be spent by whoever asked for the code.
   */
  it("a stranger's guesses cannot spend the code's attempts", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const flow = ev.newFlowToken().token;
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow);
    const text = ((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { text: string }).text;
    const code = text.match(/\b(\d{6})\b/)![1];

    // Ten guesses from someone with no flow token — twice the lockout.
    for (let i = 0; i < 10; i += 1) {
      const res = await ev.checkVerificationCode(`mine-${s}@t.test`, "000000");
      expect(res.ok).toBe(false);
    }

    const row = await prisma.emailVerificationCode.findFirst({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.attempts).toBe(0);

    // And the owner's real code still works.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, code, flow)).ok).toBe(true);
  });

  /**
   * The counter still has to work for the person who DOES hold the flow —
   * otherwise this would have traded a denial of service for unlimited
   * guessing at six digits.
   */
  it("still locks out after five wrong guesses from the real requester", async () => {
    const flow = ev.newFlowToken().token;
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow);

    for (let i = 0; i < 5; i += 1) {
      expect((await ev.checkVerificationCode(`mine-${s}@t.test`, "000000", flow)).ok).toBe(false);
    }

    const row = await prisma.emailVerificationCode.findFirst({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.attempts).toBe(5);
  });

  it("a flow token from one request cannot spend another request's code", async () => {
    const stale = ev.newFlowToken().token;
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", stale);
    // A fresh request supersedes it and issues a new flow.
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token);

    for (let i = 0; i < 3; i += 1) {
      await ev.checkVerificationCode(`mine-${s}@t.test`, "000000", stale);
    }
    const row = await prisma.emailVerificationCode.findFirst({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.attempts).toBe(0);
  });

  /**
   * Anyone mid-verification when this deploys holds a code with no flow bound
   * to it. Those must keep working, or the fix strands the people it protects.
   */
  it("a code issued before flow binding existed still verifies", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    await ev.resendVerificationCode(`mine-${s}@t.test`);
    const text = ((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { text: string }).text;
    const code = text.match(/\b(\d{6})\b/)![1];

    await prisma.emailVerificationCode.updateMany({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      data: { flowHash: null },
    });

    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, code)).ok).toBe(true);
  });
});
