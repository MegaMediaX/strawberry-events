import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    organization: { findUnique: vi.fn(), findMany: vi.fn() },
    organizationMember: { create: vi.fn() },
    passwordResetToken: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/tokens/reset-token", () => ({
  generateResetToken: () => ({ token: "plain-tok", tokenHash: "hash-tok" }),
}));

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { inviteUser } from "@/lib/admin/users";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const superAdmin: SessionContext = { userId: "s1", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u3",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  m(prisma.organization.findUnique).mockResolvedValue({ id: "orgA", name: "Acme" });
  m(prisma.user.findUnique).mockResolvedValue(null);
  m(prisma.user.create).mockResolvedValue({ id: "newU", email: "x@y.com" });
  m(prisma.organizationMember.create).mockResolvedValue({});
  m(prisma.passwordResetToken.create).mockResolvedValue({});
  m(sendEmail).mockResolvedValue(true);
});

describe("inviteUser — happy path", () => {
  it("creates the user + membership + token and emails the invite, audited", async () => {
    const res = await inviteUser(orgAdmin, {
      email: "New.Person@Example.com ",
      name: " Pat ",
      organizationId: "orgA",
      role: "checkin_staff",
    });
    expect(res.userId).toBe("newU");
    expect(res.emailSent).toBe(true);
    // email normalized + name trimmed
    expect(m(prisma.user.create).mock.calls[0][0].data).toMatchObject({
      email: "new.person@example.com",
      name: "Pat",
      status: "active",
    });
    expect(m(prisma.organizationMember.create).mock.calls[0][0].data).toMatchObject({
      organizationId: "orgA",
      userId: "newU",
      role: "checkin_staff",
    });
    expect(m(prisma.passwordResetToken.create).mock.calls[0][0].data).toMatchObject({
      userId: "newU",
      tokenHash: "hash-tok",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("still creates the account but reports emailSent=false when delivery fails", async () => {
    m(sendEmail).mockResolvedValue(false);
    const res = await inviteUser(orgAdmin, { email: "a@b.com", organizationId: "orgA", role: "finance" });
    expect(res.emailSent).toBe(false);
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

describe("inviteUser — role hierarchy + scope", () => {
  it("org admin cannot invite a super_admin", async () => {
    await expect(
      inviteUser(orgAdmin, { email: "a@b.com", organizationId: "orgA", role: "super_admin" }),
    ).rejects.toThrow(/super admin/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("org admin cannot invite into an org they don't administer", async () => {
    await expect(
      inviteUser(orgAdmin, { email: "a@b.com", organizationId: "orgB", role: "finance" }),
    ).rejects.toThrow(/organization/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("super admin CAN invite a super_admin", async () => {
    await inviteUser(superAdmin, { email: "boss@b.com", organizationId: "orgA", role: "super_admin" });
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("finance cannot invite at all", async () => {
    await expect(
      inviteUser(finance, { email: "a@b.com", organizationId: "orgA", role: "checkin_staff" }),
    ).rejects.toThrow();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("impersonating session is blocked", async () => {
    await expect(
      inviteUser({ ...orgAdmin, impersonating: true }, { email: "a@b.com", organizationId: "orgA", role: "finance" }),
    ).rejects.toThrow(/impersonat/i);
  });
});

describe("inviteUser — validation", () => {
  it("rejects an invalid email", async () => {
    await expect(
      inviteUser(orgAdmin, { email: "not-an-email", organizationId: "orgA", role: "finance" }),
    ).rejects.toThrow(/valid email/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email (manage the existing user instead)", async () => {
    m(prisma.user.findUnique).mockResolvedValue({ id: "exists", email: "dup@b.com" });
    await expect(
      inviteUser(orgAdmin, { email: "dup@b.com", organizationId: "orgA", role: "finance" }),
    ).rejects.toThrow(/already exists/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
