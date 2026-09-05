import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { update: vi.fn() },
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
  CODE_REJECTED,
  MAX_ATTEMPTS,
} from "@/lib/auth/email-verification";
import { generateCode } from "@/lib/tokens/verification-code";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const future = () => new Date(Date.now() + 60_000);

beforeEach(() => {
  vi.clearAllMocks();
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
  it("supersedes any live code for the address before issuing a new one", async () => {
    const minted = await mintCode();
    await storeAndSendCode("u1", "A@X.com", minted);

    const supersede = mock(prisma.emailVerificationCode.updateMany).mock.calls[0][0];
    expect(supersede.where).toMatchObject({ email: "a@x.com", usedAt: null, supersededAt: null });
    expect(supersede.data.supersededAt).toBeInstanceOf(Date);

    // ...and only then creates the replacement, so two codes are never live.
    const order = mock(prisma.emailVerificationCode.updateMany).mock.invocationCallOrder[0];
    expect(mock(prisma.emailVerificationCode.create).mock.invocationCallOrder[0]).toBeGreaterThan(order);
  });

  it("never stores or mails the code in a recoverable form", async () => {
    const minted = await mintCode();
    await storeAndSendCode("u1", "a@x.com", minted);

    const stored = mock(prisma.emailVerificationCode.create).mock.calls[0][0].data.codeHash;
    expect(stored).not.toContain(minted.code);
    expect(stored.startsWith("$argon2")).toBe(true);

    // The plaintext belongs in exactly one place: the email.
    expect(mock(sendEmail).mock.calls[0][0].text).toContain(minted.code);
  });
});

describe("checkVerificationCode", () => {
  function liveRow(codeHash: string, over: Record<string, unknown> = {}) {
    return { id: "c1", userId: "u1", email: "a@x.com", codeHash, attempts: 0, expiresAt: future(), usedAt: null, supersededAt: null, ...over };
  }

  it("accepts the right code and marks the address verified", async () => {
    const minted = await mintCode();
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));

    const res = await checkVerificationCode("a@x.com", minted.code);
    expect(res.ok).toBe(true);
    expect(mock(prisma.user.update).mock.calls[0][0]).toMatchObject({
      where: { id: "u1" },
    });
    expect(mock(prisma.user.update).mock.calls[0][0].data.emailVerified).toBeInstanceOf(Date);
  });

  it("counts a wrong guess against the row, not against memory", async () => {
    const minted = await mintCode();
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));

    const res = await checkVerificationCode("a@x.com", "000000");
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

  it("looks up by address and excludes spent, superseded, expired and locked rows", async () => {
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    await checkVerificationCode("A@X.com ", "123456");

    const where = mock(prisma.emailVerificationCode.findFirst).mock.calls[0][0].where;
    expect(where.email).toBe("a@x.com"); // normalised
    expect(where.usedAt).toBeNull();
    expect(where.supersededAt).toBeNull();
    expect(where.expiresAt).toHaveProperty("gt");
    expect(where.attempts).toEqual({ lt: MAX_ATTEMPTS });
    // Never by codeHash: that would let anyone sweep the live code space.
    expect("codeHash" in where).toBe(false);
  });

  it("is single-use — the claim, not the read, is what enforces it", async () => {
    const minted = await mintCode();
    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));
    // A concurrent request won the claim first.
    mock(prisma.emailVerificationCode.updateMany).mockResolvedValue({ count: 0 });

    const res = await checkVerificationCode("a@x.com", minted.code);
    expect(res.ok).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("answers every failure with one identical string", async () => {
    const minted = await mintCode();

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    const noCode = await checkVerificationCode("nobody@x.com", "123456");

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(liveRow(minted.codeHash));
    const wrong = await checkVerificationCode("a@x.com", "000000");

    const malformed = await checkVerificationCode("a@x.com", "abc");

    mock(prisma.emailVerificationCode.findFirst).mockResolvedValue(null);
    const locked = await checkVerificationCode("a@x.com", "123456");

    for (const r of [noCode, wrong, malformed, locked]) {
      expect(r).toEqual({ ok: false, error: CODE_REJECTED });
    }
  });

  it("rejects a malformed code without touching the database", async () => {
    const res = await checkVerificationCode("a@x.com", "12345");
    expect(res.ok).toBe(false);
    expect(prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
  });
});
