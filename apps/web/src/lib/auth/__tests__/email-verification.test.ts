import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    emailVerificationCode: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import {
  mintCode,
  storeAndSendCode,
  checkVerificationCode,
  resendVerificationCode,
  CODE_REJECTED,
  MAX_ATTEMPTS,
  MAIL_LIMIT,
  MAIL_LIMIT_PER_ORIGIN,
  hashFlowToken,
} from "@/lib/auth/email-verification";
import { __resetRateLimits } from "@/lib/security/rate-limit";
import { generateCode } from "@/lib/tokens/verification-code";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const future = () => new Date(Date.now() + 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  mock(prisma.emailVerificationCode.updateMany).mockResolvedValue({ count: 1 });
  mock(prisma.emailVerificationCode.create).mockResolvedValue({ id: "c1" });
  mock(prisma.emailVerificationCode.update).mockResolvedValue({ id: "c1" });
  mock(prisma.user.update).mockResolvedValue({ id: "u1" });
});

describe("generateCode", () => {
  it("is always six digits, leading zeros kept", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("does not collapse to a small set", () => {
    const seen = new Set(Array.from({ length: 300 }, () => generateCode()));
    // 300 draws from 10^6 should almost never repeat; a broken generator
    // (constant, or Math.random seeded per call) collapses immediately.
    expect(seen.size).toBeGreaterThan(290);
  });
});

describe("storeAndSendCode", () => {
  it("supersedes this FLOW's live code, not every live code for the address", async () => {
    const minted = await mintCode("test-flow");
    await storeAndSendCode("u1", "A@X.com", minted);

    const supersede = mock(prisma.emailVerificationCode.updateMany).mock.calls[0][0];
    expect(supersede.where).toMatchObject({ email: "a@x.com", usedAt: null, supersededAt: null });
    /**
     * The assertion that actually distinguishes the fix from the bug.
     *
     * `toMatchObject` ignores extra keys, so the line above passed just as
     * happily when this cleared every live code for the address — which is what
     * let a stranger's request kill the code you were holding. Pin the key.
     */
    expect(supersede.where.flowHash).toBe(minted.flowHash);
    expect(supersede.data.supersededAt).toBeInstanceOf(Date);

    // ...and only then creates the replacement, so two codes are never live.
    const order = mock(prisma.emailVerificationCode.updateMany).mock.invocationCallOrder[0];
    expect(mock(prisma.emailVerificationCode.create).mock.invocationCallOrder[0]).toBeGreaterThan(order);
  });

  it("never stores or mails the code in a recoverable form", async () => {
    const minted = await mintCode("test-flow");
    await storeAndSendCode("u1", "a@x.com", minted);

    const stored = mock(prisma.emailVerificationCode.create).mock.calls[0][0].data.codeHash;
    expect(stored).not.toContain(minted.code);
    expect(stored.startsWith("$argon2")).toBe(true);

    // The plaintext belongs in exactly one place: the email.
    expect(mock(sendEmail).mock.calls[0][0].text).toContain(minted.code);
  });
});

describe("checkVerificationCode", () => {
  /**
   * The token every row in this file is issued to.
   *
   * A fixture without a flowHash would be rejected by the flow guard before
   * reaching whatever the test is actually about — so each case would still go
   * red or green, but for a reason unrelated to its name.
   */
  const FLOW = "test-flow";

  function liveRow(codeHash: string, over: Record<string, unknown> = {}) {
    return { id: "c1", userId: "u1", email: "a@x.com", codeHash, flowHash: hashFlowToken(FLOW), attempts: 0, expiresAt: future(), usedAt: null, supersededAt: null, ...over };
  }

  it("accepts the right code and marks the address verified", async () => {
    const minted = await mintCode("test-flow");
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));

    const res = await checkVerificationCode("a@x.com", minted.code, FLOW);
    expect(res.ok).toBe(true);
    expect(mock(prisma.user.update).mock.calls[0][0]).toMatchObject({
      where: { id: "u1" },
    });
    expect(mock(prisma.user.update).mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date);
  });

  it("counts a wrong guess against the row, not against memory", async () => {
    const minted = await mintCode("test-flow");
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));

    const res = await checkVerificationCode("a@x.com", "000000", FLOW);
    expect(res.ok).toBe(false);
    // The attempt counter has to survive a container restart — the in-memory
    // limiter is wiped on every deploy, and CI recreates the container on
    // every merge.
    expect(mock(prisma.emailVerificationCode.update).mock.calls[0][0]).toMatchObject({
      where: { id: "c1" },
      data: { attempts: { increment: 1 } },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * The compatibility branch this replaces accepted a guess with NO flow token
   * against any row whose flowHash was null, which is how a stranger reached
   * someone else's code. There is no such branch now: no token, no lookup.
   */
  it("refuses a guess that carries no flow token, without even looking", async () => {
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow("unused"));

    const res = await checkVerificationCode("a@x.com", "123456");

    expect(res.ok).toBe(false);
    expect(prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailVerificationCode.update).not.toHaveBeenCalled();
  });

  it("refuses a row whose flowHash does not match the token presented", async () => {
    const minted = await mintCode(FLOW);
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(
      liveRow(minted.codeHash, { flowHash: hashFlowToken("someone-elses-flow") }),
    );

    // Even with the correct code, and even though the query returned a row.
    const res = await checkVerificationCode("a@x.com", minted.code, FLOW);

    expect(res.ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("looks up by address and excludes spent, superseded, expired and locked rows", async () => {
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    await checkVerificationCode("A@X.com ", "123456", FLOW);

    const where = mock(prisma.emailVerificationCode.findFirst).mock.calls[0][0].where;
    expect(where.email).toBe("a@x.com"); // normalised
    expect(where.usedAt).toBeNull();
    expect(where.supersededAt).toBeNull();
    expect(where.expiresAt).toHaveProperty("gt");
    expect(where.attempts).toEqual({ lt: MAX_ATTEMPTS });
    // Scoped to the flow, which is what stops one caller reaching another's row.
    expect(where.flowHash).toBe(hashFlowToken(FLOW));
    // Never by codeHash: that would let anyone sweep the live code space.
    expect("codeHash" in where).toBe(false);
  });

  it("is single-use — the claim, not the read, is what enforces it", async () => {
    const minted = await mintCode("test-flow");
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));
    // A concurrent request won the claim first.
    mock(prisma.emailVerificationCode.updateMany).mockResolvedValue({ count: 0 });

    const res = await checkVerificationCode("a@x.com", minted.code, FLOW);
    expect(res.ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("answers every failure with one identical string", async () => {
    const minted = await mintCode("test-flow");

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    const noCode = await checkVerificationCode("nobody@x.com", "123456", FLOW);

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));
    const wrong = await checkVerificationCode("a@x.com", "000000", FLOW);

    const malformed = await checkVerificationCode("a@x.com", "abc", FLOW);

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    const locked = await checkVerificationCode("a@x.com", "123456", FLOW);

    for (const r of [noCode, wrong, malformed, locked]) {
      expect(r).toEqual({ ok: false, error: CODE_REJECTED });
    }
  });

  it("rejects a malformed code without touching the database", async () => {
    const res = await checkVerificationCode("a@x.com", "12345", FLOW);
    expect(res.ok).toBe(false);
    expect(prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
  });
});

describe("resendVerificationCode", () => {
  /**
   * The bug this exists for: re-running signup to "send a new code" cannot
   * work, because the first submit created the account. The second call finds
   * it present, takes the existing-address branch, and mails "you already have
   * an account" — no new code, and a baffling message for someone who signed up
   * a minute ago. Anyone whose code expired had no way back.
   */
  it("issues a NEW code for an account still waiting to be verified", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      status: "active",
      emailVerified: null,
    });

    await resendVerificationCode("a@x.com", "en", "test-flow", { kind: "public", origin: "test-origin" });

    expect(prisma.emailVerificationCode.create).toHaveBeenCalledTimes(1);
    const sent = mock(sendEmail).mock.calls[0][0];
    expect(sent.subject).toMatch(/verification code/i);
    expect(sent.subject).not.toMatch(/already have an account/i);
  });

  it("supersedes the previous code OF THAT FLOW, so one flow never has two", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      status: "active",
      emailVerified: null,
    });

    await resendVerificationCode("a@x.com", "en", "test-flow", { kind: "public", origin: "test-origin" });

    const where = mock(prisma.emailVerificationCode.updateMany).mock.calls[0][0].where;
    expect(where).toMatchObject({ email: "a@x.com", usedAt: null, supersededAt: null });
    expect(where.flowHash).toBe(hashFlowToken("test-flow"));
  });

  it("sends nothing for an unknown address, a verified account, or a suspended one", async () => {
    for (const user of [
      null,
      { id: "u1", status: "active", emailVerified: new Date() },
      { id: "u1", status: "suspended", emailVerified: null },
    ]) {
      vi.clearAllMocks();
      __resetRateLimits();
      mock(prisma.user.findUnique).mockResolvedValue(user);
      await resendVerificationCode("a@x.com", "en", "test-flow", { kind: "public", origin: "test-origin" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.emailVerificationCode.create).not.toHaveBeenCalled();
    }
  });

  it("shares one mail budget with signup, so it cannot mail someone more often", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      status: "active",
      emailVerified: null,
    });

    // A DIFFERENT origin each time, so this measures the address ceiling and
    // not the per-origin cap — they are separate limits and a single-origin
    // loop would stop at the smaller one while appearing to test the larger.
    for (let i = 0; i < MAIL_LIMIT; i += 1) {
      await resendVerificationCode("a@x.com", "en", "test-flow", { kind: "public", origin: `10.0.0.${i}` });
    }
    expect(mock(sendEmail).mock.calls).toHaveLength(MAIL_LIMIT);

    await resendVerificationCode("a@x.com", "en", "test-flow", { kind: "public", origin: "10.0.0.99" });
    expect(mock(sendEmail).mock.calls).toHaveLength(MAIL_LIMIT); // capped

    // Sending with no origin charges only the ceiling — the per-origin cap is a
    // property of the caller, and the lib is called without one from the
    // session-authenticated profile route.
    expect(MAIL_LIMIT_PER_ORIGIN).toBeLessThan(MAIL_LIMIT);
  });
});
