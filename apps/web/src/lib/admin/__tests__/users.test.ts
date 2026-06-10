import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organizationMember: { upsert: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { listUsers, setUserStatus, changeRole } from "@/lib/admin/users";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "su", isSuperAdmin: true, memberships: [] };
const orgAdminA: SessionContext = {
  userId: "a1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "f1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const checkin: SessionContext = {
  userId: "c1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
};

// target user in orgA (non-super)
const targetA = { id: "t1", email: "t@x.com", status: "active", memberships: [{ organizationId: "orgA", role: "checkin_staff" }] };
// target who is a super admin
const targetSuper = { id: "t2", email: "s@x.com", status: "active", memberships: [{ organizationId: "orgA", role: "super_admin" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.user.findMany).mockResolvedValue([]);
  mock(prisma.user.update).mockResolvedValue({ id: "t1", status: "suspended" });
  mock(prisma.organizationMember.upsert).mockResolvedValue({ id: "m1" });
});

describe("listUsers — scope", () => {
  it("super admin lists all users (unconstrained)", async () => {
    await listUsers(sa);
    expect(mock(prisma.user.findMany).mock.calls[0][0].where).toEqual({});
  });
  it("organizer admin lists only members of orgs they administer", async () => {
    await listUsers(orgAdminA);
    expect(mock(prisma.user.findMany).mock.calls[0][0].where).toEqual({
      memberships: { some: { organizationId: { in: ["orgA"] } } },
    });
  });
  it("finance cannot list users", async () => {
    await expect(listUsers(finance)).rejects.toThrow();
  });
  it("check-in staff cannot list users", async () => {
    await expect(listUsers(checkin)).rejects.toThrow();
  });
});

describe("changeRole", () => {
  beforeEach(() => mock(prisma.user.findUnique).mockResolvedValue(targetA));

  it("super admin can change a user's role; audited", async () => {
    await changeRole(sa, "t1", "orgA", "organizer_admin");
    expect(prisma.organizationMember.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
  it("organizer admin CANNOT grant super_admin", async () => {
    await expect(changeRole(orgAdminA, "t1", "orgA", "super_admin")).rejects.toThrow();
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
  });
  it("organizer admin can set a normal role within their org", async () => {
    await changeRole(orgAdminA, "t1", "orgA", "finance");
    expect(prisma.organizationMember.upsert).toHaveBeenCalledTimes(1);
  });
  it("organizer admin cannot change roles in an org they do not administer", async () => {
    await expect(changeRole(orgAdminA, "t1", "orgB", "finance")).rejects.toThrow();
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
  });
  it("finance is blocked", async () => {
    await expect(changeRole(finance, "t1", "orgA", "finance")).rejects.toThrow();
  });
  it("impersonating session is blocked", async () => {
    await expect(changeRole({ ...sa, impersonating: true }, "t1", "orgA", "finance")).rejects.toThrow();
    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled();
  });
});

describe("setUserStatus", () => {
  it("super admin can suspend a user; audited", async () => {
    mock(prisma.user.findUnique).mockResolvedValue(targetA);
    await setUserStatus(sa, "t1", "suspended");
    expect(mock(prisma.user.update).mock.calls[0][0]).toMatchObject({ where: { id: "t1" }, data: { status: "suspended" } });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
  it("organizer admin cannot suspend a super admin", async () => {
    mock(prisma.user.findUnique).mockResolvedValue(targetSuper);
    await expect(setUserStatus(orgAdminA, "t2", "suspended")).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("impersonating session cannot change status", async () => {
    mock(prisma.user.findUnique).mockResolvedValue(targetA);
    await expect(setUserStatus({ ...sa, impersonating: true }, "t1", "suspended")).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
