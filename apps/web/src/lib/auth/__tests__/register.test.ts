import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    emailVerificationCode: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn().mockResolvedValue("argon2hash") }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { __resetRateLimits } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/service";
import { registerAttendee } from "@/lib/auth/register";
import { MAIL_LIMIT, MAIL_LIMIT_PER_ORIGIN } from "@/lib/auth/email-verification";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  mock(prisma.user.findUnique).mockResolvedValue(null);
  mock(prisma.user.create).mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
  mock(prisma.emailVerificationCode.updateMany).mockResolvedValue({ count: 0 });
  mock(prisma.emailVerificationCode.create).mockResolvedValue({ id: "c1" });
  process.env.APP_URL = "https://events.example";
});

describe("registerAttendee", () => {
  it("creates a role-less account with a hashed password and no email verification", async () => {
    const res = await registerAttendee("New@X.com", "longenough1", "Jane", "en", "test-flow", undefined);
    expect(res).toEqual({ ok: true });
    const data = mock(prisma.user.create).mock.calls[0][0].data;
    expect(data.email).toBe("new@x.com"); // normalized
    expect(data.passwordHash).toBe("argon2hash");
    expect(data.emailVerified).toBeNull();
    expect("memberships" in data).toBe(false); // no role granted
  });

  it("rejects a weak password before any DB call", async () => {
    const res = await registerAttendee("a@b.com", "short", undefined, "en", "test-flow", undefined);
    expect(res.ok).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await registerAttendee("not-an-email", "longenough1", undefined, "en", "test-flow", undefined);
    expect(res.ok).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  /**
   * The regression this file exists for. The previous behaviour returned
   * "An account with this email already exists.", which made the public signup
   * form a membership oracle for any address an attacker chose to type.
   */
  it("answers a taken address exactly as it answers a free one", async () => {
    const free = await registerAttendee("free@x.com", "longenough1", undefined, "en", "test-flow", undefined);

    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    const taken = await registerAttendee("dupe@x.com", "longenough1", undefined, "en", "test-flow", undefined);

    expect(taken).toEqual(free);
    expect(taken).toEqual({ ok: true });
    expect(JSON.stringify(taken)).toBe(JSON.stringify(free));
  });

  it("never creates a second account for a taken address", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("does not leak the result through the userId either", async () => {
    const res = await registerAttendee("new@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect("userId" in res).toBe(false);
  });

  it("tells the mailbox owner, not the submitter, that the account exists", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1", undefined, "en", "test-flow", undefined);

    const [email] = mock(sendEmail).mock.calls[0];
    expect(email.to).toBe("dupe@x.com");
    expect(email.subject).toMatch(/already have an account/i);
    expect(email.text).toContain("https://events.example/en/login");
  });

  it("sends exactly one mail on either branch, so the screen is true both ways", async () => {
    await registerAttendee("free@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(mock(sendEmail).mock.calls).toHaveLength(1);
    expect(mock(sendEmail).mock.calls[0][0].subject).toMatch(/verification code/i);

    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(mock(sendEmail).mock.calls).toHaveLength(1);
  });

  it("stays silent for a suspended account but still answers success", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "suspended" });
    const res = await registerAttendee("suspended@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(res).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("still answers success when the mail transport throws", async () => {
    mock(sendEmail).mockRejectedValueOnce(new Error("smtp down"));
    const res = await registerAttendee("new@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(res).toEqual({ ok: true });
  });
});

describe("registerAttendee — work done, not just words said", () => {
  /**
   * The response bodies were made identical first; that alone was not enough.
   * argon2id is ~20ms of CPU with very little variance, so hashing on only one
   * branch let a caller who cannot see a difference in what we SAY time what we
   * DO. Asserting the call happens on both branches is the deterministic form
   * of that property — timing it in CI would be flaky and prove less.
   */
  /**
   * Asserted as an EQUALITY between the branches, not a fixed number: the point
   * is that neither branch is cheaper, and hardcoding a count would go stale the
   * next time the flow gains or loses an argon2 call (it already gained one when
   * signup started minting a verification code).
   */
  async function argon2CallsFor(kind: "free" | "taken" | "suspended") {
    vi.clearAllMocks();
    mock(prisma.emailVerificationCode.updateMany).mockResolvedValue({ count: 0 });
    mock(prisma.emailVerificationCode.create).mockResolvedValue({ id: "c1" });
    mock(prisma.user.create).mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
    mock(prisma.user.findUnique).mockResolvedValue(
      kind === "free" ? null : { id: "existing", status: kind === "suspended" ? "suspended" : "active" },
    );
    await registerAttendee(`${kind}@x.com`, "longenough1", undefined, "en", "test-flow", undefined);
    return mock(hashPassword).mock.calls.length;
  }

  it("does the same argon2 work on every branch, so none is cheaper to time", async () => {
    const free = await argon2CallsFor("free");
    const taken = await argon2CallsFor("taken");
    const suspended = await argon2CallsFor("suspended");

    expect(free).toBeGreaterThan(0);
    expect(taken).toBe(free);
    expect(suspended).toBe(free);
  });

  it("discards the work rather than creating an account for a taken address", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(hashPassword).toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("caps signup mail per address so it cannot be used to mailbomb", async () => {
    for (let i = 0; i < MAIL_LIMIT; i += 1) {
      vi.clearAllMocks();
      mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
      await registerAttendee("victim@x.com", "longenough1", undefined, "en", "test-flow", undefined);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    }

    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("victim@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(sendEmail).not.toHaveBeenCalled();

    // A different address is unaffected — the cap is per victim, not global.
    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("someone-else@x.com", "longenough1", undefined, "en", "test-flow", undefined);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("logs a broken transport server-side instead of swallowing it silently", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mock(sendEmail).mockRejectedValueOnce(new Error("smtp down"));

    const res = await registerAttendee("new@x.com", "longenough1", undefined, "en", "test-flow", undefined);

    expect(res).toEqual({ ok: true }); // caller still learns nothing
    expect(spy).toHaveBeenCalled();
    // The address must not end up in the logs.
    expect(String(spy.mock.calls[0])).not.toContain("new@x.com");
    spy.mockRestore();
  });

  /**
   * The signup form is the OTHER way to spend a stranger's mail budget.
   *
   * Typing a victim's address here consumes the same per-address ceiling the
   * resend route does, so capping only the resend would have left the lockout
   * fully open. Both doors charge the per-origin cap.
   */
  it("one origin cannot spend a victim's whole budget through the signup form", async () => {
    const send = async (origin: string | undefined) => {
      vi.clearAllMocks();
      mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
      await registerAttendee("target@x.com", "longenough1", undefined, "en", "test-flow", origin);
      return mock(sendEmail).mock.calls.length;
    };

    for (let i = 0; i < MAIL_LIMIT_PER_ORIGIN; i += 1) {
      expect(await send("203.0.113.9")).toBe(1);
    }
    // That origin is spent, while the address ceiling is not.
    expect(await send("203.0.113.9")).toBe(0);
    expect(await send("198.51.100.4")).toBe(1);
  });
});
