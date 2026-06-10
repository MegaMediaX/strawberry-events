import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn().mockResolvedValue("argon2hash") }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { hashResetToken } from "@/lib/tokens/reset-token";
import { requestPasswordReset, resetPassword } from "@/lib/auth/password-reset";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://app";
});

describe("requestPasswordReset — no account enumeration", () => {
  it("does nothing for an unknown email (no token, no email)", async () => {
    mock(prisma.user.findUnique).mockResolvedValue(null);
    await requestPasswordReset("nobody@x.com");
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("does nothing for a suspended user", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@x.com", status: "suspended" });
    await requestPasswordReset("a@x.com");
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("creates a hashed token + emails the link for an active user", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@x.com", status: "active" });
    await requestPasswordReset("a@x.com");
    const data = mock(prisma.passwordResetToken.create).mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("resetPassword", () => {
  const valid = { id: "t1", userId: "u1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) };

  it("rejects a too-short password before touching the DB", async () => {
    const res = await resetPassword("tok", "short");
    expect(res.ok).toBe(false);
    expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });
  it("resets the password and marks the token used (single-use)", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(valid);
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(true);
    // looked up by the HASH, not the plaintext
    expect(mock(prisma.passwordResetToken.findUnique).mock.calls[0][0].where).toEqual({ tokenHash: hashResetToken("plaintext") });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "argon2hash" } });
    expect(prisma.passwordResetToken.update).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
  it("rejects an already-used token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue({ ...valid, usedAt: new Date() });
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects an expired token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue({ ...valid, expiresAt: new Date(Date.now() - 1) });
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
  });
  it("rejects an unknown token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(null);
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
  });
});
