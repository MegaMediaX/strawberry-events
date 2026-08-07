import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      // Default: this request wins the claim. Race tests override per-call.
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
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
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
  it("claims the token with a compare-and-set guarded on unused + unexpired", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(valid);
    await resetPassword("plaintext", "longenough123");
    const [{ where, data }] = mock(prisma.passwordResetToken.updateMany).mock.calls[0];
    // Guarded on the hash AND the two conditions the read checked — otherwise the
    // read would still be the only guard and the claim would be decorative.
    expect(where.tokenHash).toBe(hashResetToken("plaintext"));
    expect(where.usedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(data.usedAt).toBeInstanceOf(Date);
  });
  it("loses the race when a concurrent request claims the same token first", async () => {
    // Both requests read the token while it was still unused — that is exactly the
    // window the old read-then-write left open. The DB lets one updateMany match.
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(valid);
    mock(prisma.passwordResetToken.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [first, second] = await Promise.all([
      resetPassword("plaintext", "longenough123"),
      resetPassword("plaintext", "otherpassword123"),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toBe("This reset link is invalid or has expired.");
    // Only the winner writes a credential — no last-write-wins on passwordHash.
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
  it("leaves the token burned when the credential write fails (fail-closed)", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(valid);
    mock(prisma.$transaction).mockRejectedValueOnce(new Error("db down"));
    await expect(resetPassword("plaintext", "longenough123")).rejects.toThrow("db down");
    // No release helper: usedAt is never set back to null, because doing so would
    // reopen the race. The user requests a fresh link instead.
    const releases = mock(prisma.passwordResetToken.updateMany).mock.calls.filter(
      (c) => c[0].data.usedAt === null,
    );
    expect(releases).toHaveLength(0);
  });
  // The read still short-circuits these three: it costs one query and keeps the
  // friendly wording, so the claim is only reached by plausibly-valid tokens.
  it("rejects an already-used token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue({ ...valid, usedAt: new Date() });
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("This reset link is invalid or has expired.");
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects an expired token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue({ ...valid, expiresAt: new Date(Date.now() - 1) });
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("This reset link is invalid or has expired.");
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });
  it("rejects an unknown token", async () => {
    mock(prisma.passwordResetToken.findUnique).mockResolvedValue(null);
    const res = await resetPassword("plaintext", "longenough123");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("This reset link is invalid or has expired.");
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });
  it("keeps the password-length error distinct from the token error", async () => {
    const res = await resetPassword("plaintext", "short");
    expect(res.error).toBe("Password must be at least 8 characters.");
  });
  it("keeps a missing token's error distinct", async () => {
    const res = await resetPassword("", "longenough123");
    expect(res.error).toBe("Invalid or expired reset link.");
  });
});
