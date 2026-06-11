import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn().mockResolvedValue("argon2hash") }));

import { prisma } from "@/lib/db/client";
import { registerAttendee } from "@/lib/auth/register";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.user.findUnique).mockResolvedValue(null);
  mock(prisma.user.create).mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
});

describe("registerAttendee", () => {
  it("creates a role-less account with a hashed password and no email verification", async () => {
    const res = await registerAttendee("New@X.com", "longenough1", "Jane");
    expect(res).toEqual({ ok: true, userId: "u1" });
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

  it("rejects a duplicate email (no enumeration leak beyond 'already exists')", async () => {
    mock(prisma.user.findUnique).mockResolvedValue({ id: "existing" });
    const res = await registerAttendee("dupe@x.com", "longenough1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
