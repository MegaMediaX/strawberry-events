import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/auth/password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue({ ok: true }),
}));

import { rateLimit } from "@/lib/security/rate-limit";
import { requestPasswordReset, resetPassword } from "@/lib/auth/password-reset";
import { forgotPasswordAction } from "../forgot-password/actions";
import { resetPasswordAction } from "../reset-password/actions";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(rateLimit).mockReturnValue({ allowed: true });
});

describe("forgotPasswordAction — neutral + rate-limited", () => {
  it("always returns done and triggers the reset service when allowed", async () => {
    const res = await forgotPasswordAction("en", "a@x.com");
    expect(res).toEqual({ done: true });
    expect(requestPasswordReset).toHaveBeenCalledWith("a@x.com", "en");
  });
  it("still returns the neutral done when rate-limited (no signal, no send)", async () => {
    mock(rateLimit).mockReturnValue({ allowed: false });
    const res = await forgotPasswordAction("en", "a@x.com");
    expect(res).toEqual({ done: true });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  it("rejects a password mismatch without calling the service", async () => {
    const res = await resetPasswordAction("tok", "longpass1", "different1");
    expect(res.ok).toBe(false);
    expect(resetPassword).not.toHaveBeenCalled();
  });
  it("delegates to resetPassword when the passwords match", async () => {
    const res = await resetPasswordAction("tok", "longpass1", "longpass1");
    expect(res.ok).toBe(true);
    expect(resetPassword).toHaveBeenCalledWith("tok", "longpass1");
  });
});
