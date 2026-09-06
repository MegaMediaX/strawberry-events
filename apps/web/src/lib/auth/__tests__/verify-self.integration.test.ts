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
    await ev.resendVerificationCode(email, "en", flow, { kind: "public", origin: "test-origin" });
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
    await ev.resendVerificationCode(`done-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "public", origin: "test-origin" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  /**
   * Supersession is per-FLOW now, not per address.
   *
   * `issueAndRead` mints a new flow each call, so these are two independent
   * requests and both codes stay live — which is the entire point: a second
   * person asking for a code at this address must not kill the first person's.
   * The same-flow replacement case is covered separately below.
   */
  it("two separate requests each keep their own live code", async () => {
    const first = await issueAndRead(`mine-${s}@t.test`);
    const second = await issueAndRead(`mine-${s}@t.test`);
    expect(second.code).not.toBe(first.code);

    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, first.code, first.flow)).ok).toBe(true);
    // And neither flow can reach the other's code.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, second.code, first.flow)).ok).toBe(false);
  });

  /**
   * Shares the per-address budget with signup, so this route cannot be used to
   * mail someone more often than signing up already could.
   *
   * Pinned to the constant rather than a literal: the ceiling was raised when
   * the per-origin cap went in beneath it, and a hard-coded 3 here would have
   * turned that into a failing test rather than the deliberate change it was.
   */
  it("is capped on the same budget as signup mail", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const sent = () => (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;

    // One origin per send: this is the address ceiling, not the per-origin cap.
    for (let i = 0; i < ev.MAIL_LIMIT; i += 1) {
      await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, {
        kind: "public",
        origin: `10.0.0.${i}`,
      });
    }
    expect(sent()).toBe(ev.MAIL_LIMIT);

    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, {
      kind: "public",
      origin: "10.0.0.99",
    });
    expect(sent()).toBe(ev.MAIL_LIMIT);
  });

  /**
   * The lockout the per-flow fix did NOT close, and the reason this cap exists.
   *
   * Asking for a code is unauthenticated and takes a typed address, so a
   * stranger could spend a victim's whole hourly mail budget in three cheap
   * requests — and because that budget is shared with signup, it also blocked a
   * genuine first-time registration at the address.
   *
   * This asserts what the cap actually delivers: one origin cannot starve the
   * address. It deliberately does NOT assert that the owner is guaranteed a
   * mail on this path. An earlier revision claimed exactly that, on the
   * arithmetic that a per-origin cap below the ceiling leaves a slot spare — and
   * it was false as soon as the owner's own signup mail took a slot first. The
   * guarantee is in the `self` test below instead, where identity makes it true.
   */
  it("one origin cannot spend the whole address budget", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const sent = () => (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;

    // A stranger, hammering from one address, far past their own cap.
    for (let i = 0; i < ev.MAIL_LIMIT + 3; i += 1) {
      await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "public", origin: "203.0.113.9" });
    }
    expect(sent()).toBe(ev.MAIL_LIMIT_PER_ORIGIN);

    // The owner, from their own connection, still gets a code.
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "public", origin: "198.51.100.4" });
    expect(sent()).toBe(ev.MAIL_LIMIT_PER_ORIGIN + 1);
  });

  /**
   * The other half, and the reason the per-origin cap is not simply "raise the
   * ceiling": spreading across origins must NOT buy more mail to one inbox.
   */
  it("many origins still cannot exceed the address ceiling", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    for (let i = 0; i < 12; i += 1) {
      await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "public", origin: `192.0.2.${i}` });
    }
    expect((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(ev.MAIL_LIMIT);
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
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow, { kind: "public", origin: "test-origin" });
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
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow, { kind: "public", origin: "test-origin" });

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
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", stale, { kind: "public", origin: "test-origin" });
    // A fresh request supersedes it and issues a new flow.
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "public", origin: "test-origin" });

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
   * This asserted the OPPOSITE one revision ago, and the reversal is the fix.
   *
   * A compatibility branch kept null-flowHash rows reachable so a code issued
   * moments before the deploy would not strand its owner. But "reachable" had no
   * owner attached: the row matched whatever token the caller presented, and the
   * recheck was written `if (row.flowHash && …)`, so it skipped exactly these
   * rows. The grace window WAS the bypass.
   *
   * It was also protecting nobody — the production table has never held a row —
   * so the branch is gone and a null flowHash is now unreachable by anyone.
   */
  it("a code with no flow bound to it is unreachable, not universally reachable", async () => {
    const { code, flow } = await issueAndRead(`mine-${s}@t.test`);
    await prisma.emailVerificationCode.updateMany({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      data: { flowHash: null },
    });

    // Not by the flow that requested it, not by a caller with no flow at all.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, code, flow)).ok).toBe(false);
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, code)).ok).toBe(false);
  });

  /**
   * The attack the grace branch reopened, stated as a test.
   *
   * A stranger mints a flow of their own — trivially, by asking for a code at
   * any address they like — and aims it at a victim's null-flow row. Under the
   * branch this reached the row and burned the victim's five attempts, which is
   * precisely the bug the whole PR exists to close.
   */
  it("a stranger's own flow token cannot reach a code that has no flow bound", async () => {
    const { code } = await issueAndRead(`mine-${s}@t.test`);
    await prisma.emailVerificationCode.updateMany({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      data: { flowHash: null },
    });

    const strangersOwnFlow = ev.newFlowToken().token;
    for (let i = 0; i < 10; i += 1) {
      await ev.checkVerificationCode(`mine-${s}@t.test`, "000000", strangersOwnFlow);
    }
    // Even the correct code, presented on a flow that did not request it.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, code, strangersOwnFlow)).ok).toBe(false);

    const row = await prisma.emailVerificationCode.findFirst({
      where: { email: `mine-${s}@t.test`, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.attempts).toBe(0);
  });

  /**
   * The bypass the first fix missed.
   *
   * Requesting a code is unauthenticated, so an attacker can ask for one at
   * someone else's address and receive a valid flow for it. Under address-wide
   * supersession that also killed the victim's live code and rebound the address
   * to the attacker's flow — locking the victim out without a single guess.
   *
   * Per-flow codes stop the attacker touching the victim's CODE. They do not,
   * on their own, stop the attacker spending the victim's mail budget — that is
   * what the per-origin cap above is for, and claiming otherwise here was this
   * PR's third wrong claim in a row.
   */
  it("a stranger requesting a code at your address cannot lock you out", async () => {
    const { sendEmail } = await import("@/lib/email/service");

    // You ask, and hold your own flow.
    const mine = ev.newFlowToken().token;
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", mine, { kind: "public", origin: "test-origin" });
    const myCode = (((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0]) as { text: string }).text.match(/\b(\d{6})\b/)![1];

    // A stranger asks for a code at YOUR address and gets their own flow.
    const theirs = ev.newFlowToken().token;
    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", theirs, { kind: "public", origin: "test-origin" });
    const theirCode = (((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0]) as { text: string }).text.match(/\b(\d{6})\b/)![1];

    // They burn their own code's attempts to the limit.
    for (let i = 0; i < 6; i += 1) {
      expect((await ev.checkVerificationCode(`mine-${s}@t.test`, "000000", theirs)).ok).toBe(false);
    }
    // And they cannot guess against yours either — their flow reaches only their row.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, myCode, theirs)).ok).toBe(false);

    // Yours still works, untouched.
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, myCode, mine)).ok).toBe(true);
    void theirCode;
  });

  /**
   * The counterpart: your own resend must still replace your own code, or every
   * click would leave another live row behind.
   */
  it("resending from the same flow replaces that flow's code", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const flow = ev.newFlowToken().token;

    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow, { kind: "public", origin: "test-origin" });
    const first = (((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0]) as { text: string }).text.match(/\b(\d{6})\b/)![1];

    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", flow, { kind: "public", origin: "test-origin" });
    const second = (((sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0]) as { text: string }).text.match(/\b(\d{6})\b/)![1];

    // Counted BEFORE verifying: a successful check consumes the code, so
    // asserting liveness afterwards would always read zero.
    const live = await prisma.emailVerificationCode.count({
      where: { email: `mine-${s}@t.test`, usedAt: null, supersededAt: null },
    });
    expect(live).toBe(1);

    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, first, flow)).ok).toBe(false);
    expect((await ev.checkVerificationCode(`mine-${s}@t.test`, second, flow)).ok).toBe(true);
  });

  /**
   * The guarantee that survives contact with an attacker.
   *
   * Rate limits cannot tell the owner of an address from a stranger who typed
   * it, so no arithmetic on the public budget can promise the owner a mail —
   * that was the mistake in the revision before this one. A session can tell
   * them apart. The profile route mails only the address on the session, so it
   * cannot be aimed at anyone else and is exempt from the public ceiling.
   *
   * So: burn the entire public budget from many origins, then confirm a
   * signed-in request still sends.
   */
  it("a signed-in request still sends after strangers exhaust the public budget", async () => {
    const { sendEmail } = await import("@/lib/email/service");
    const sent = () => (sendEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;

    for (let i = 0; i < ev.MAIL_LIMIT + 6; i += 1) {
      await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, {
        kind: "public",
        origin: `192.0.2.${i}`,
      });
    }
    // The public ceiling is spent, exactly as an attacker would leave it.
    expect(sent()).toBe(ev.MAIL_LIMIT);

    await ev.resendVerificationCode(`mine-${s}@t.test`, "en", ev.newFlowToken().token, { kind: "self" });
    expect(sent()).toBe(ev.MAIL_LIMIT + 1);
  });
});
