import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn().mockResolvedValue("argon2hash") }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { registerAttendee } from "@/lib/auth/register";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.user.findUnique).mockResolvedValue(null);
  mock(prisma.user.create).mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
  process.env.APP_URL = "https://events.example";
});

describe("registerAttendee", () => {
  it("creates a role-less account with a hashed password and no email verification", async () => {
    const res = await registerAttendee("New@X.com", "longenough1", "Jane");
    expect(res).toEqual({ ok: true });
    const data = mock(prisma.user.create).mock.calls[0][0].data;
    expect(data.email).toBe("new@x.com"); // normalized
    expect(data.passwordHash).toBe("argon2hash");
    expect(data.emailVerified).toBeNull();
    expect("memberships" in data).toBe(false); // no role granted
  });

  it("rejects a weak password before any DB call", async () => {
    const res = await registerAttendee("a@b.com", "short");
    expect(res.ok).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await registerAttendee("not-an-email", "longenough1");
    expect(res.ok).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  /**
   * The regression this file exists for. The previous behaviour returned
   * "An account with this email already exists.", which made the public signup
   * form a membership oracle for any address an attacker chose to type.
   */
  it("answers a taken address exactly as it answers a free one", async () => {
    const free = await registerAttendee("free@x.com", "longenough1");

    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    const taken = await registerAttendee("dupe@x.com", "longenough1");

    expect(taken).toEqual(free);
    expect(taken).toEqual({ ok: true });
    expect(JSON.stringify(taken)).toBe(JSON.stringify(free));
  });

  it("never creates a second account for a taken address", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("does not leak the result through the userId either", async () => {
    const res = await registerAttendee("new@x.com", "longenough1");
    expect("userId" in res).toBe(false);
  });

  it("tells the mailbox owner, not the submitter, that the account exists", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1");

    const [email] = mock(sendEmail).mock.calls[0];
    expect(email.to).toBe("dupe@x.com");
    expect(email.subject).toMatch(/already have an account/i);
    expect(email.text).toContain("https://events.example/en/login");
  });

  it("sends exactly one mail on either branch, so the screen is true both ways", async () => {
    await registerAttendee("free@x.com", "longenough1");
    expect(mock(sendEmail).mock.calls).toHaveLength(1);
    expect(mock(sendEmail).mock.calls[0][0].subject).toMatch(/account is ready/i);

    vi.clearAllMocks();
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "active" });
    await registerAttendee("dupe@x.com", "longenough1");
    expect(mock(sendEmail).mock.calls).toHaveLength(1);
  });

  it("stays silent for a suspended account but still answers success", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing", status: "suspended" });
    const res = await registerAttendee("suspended@x.com", "longenough1");
    expect(res).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("still answers success when the mail transport throws", async () => {
    mock(sendEmail).mockRejectedValueOnce(new Error("smtp down"));
    const res = await registerAttendee("new@x.com", "longenough1");
    expect(res).toEqual({ ok: true });
  });
});
