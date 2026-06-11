import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/registration/service", () => ({ register: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { register } from "@/lib/registration/service";
import { createWalkIn } from "@/lib/staff/walkin";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const staff: SessionContext = {
  userId: "s1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1"] }],
};
const orgAdmin: SessionContext = {
  userId: "a1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "f1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const mapping = { id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo" };

const attendee = { firstName: "A", lastName: "B", email: "a@b.com", phoneCC: "+961", phone: "70123456" };
const input = { eventId: "e1", itemId: 7, roleTag: "media" as const, attendee };

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.eventMapping.findUnique).mockResolvedValue(mapping);
  mock(register).mockResolvedValue({ orderCode: "WALK1", status: "paid", approvalStatus: "not_required", magicLinkToken: "t" });
});

describe("createWalkIn — permission boundaries", () => {
  it("check-in staff can create a walk-in for an assigned event; register called + audited", async () => {
    const res = await createWalkIn(staff, input);
    expect(res.orderCode).toBe("WALK1");
    const arg = mock(register).mock.calls[0][0];
    expect(arg.eventSlug).toBe("expo");
    expect(arg.roleTag).toBe("media");
    expect(arg.tickets).toEqual([{ itemId: 7, quantity: 1 }]);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mock(prisma.auditLog.create).mock.calls[0][0].data.action).toMatch(/walk/i);
  });

  it("organizer admin can create a walk-in", async () => {
    await createWalkIn(orgAdmin, input);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("check-in staff cannot create a walk-in for an UNassigned event", async () => {
    const otherStaff: SessionContext = {
      userId: "s2", isSuperAdmin: false,
      memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["locX"] }],
    };
    await expect(createWalkIn(otherStaff, input)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("finance is blocked", async () => {
    await expect(createWalkIn(finance, input)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("impersonating session is blocked", async () => {
    await expect(createWalkIn({ ...orgAdmin, impersonating: true }, input)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("cross-org is denied", async () => {
    mock(prisma.eventMapping.findUnique).mockResolvedValue({ ...mapping, organizationId: "orgB" });
    await expect(createWalkIn(orgAdmin, input)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("missing event is denied (fail closed)", async () => {
    mock(prisma.eventMapping.findUnique).mockResolvedValue(null);
    await expect(createWalkIn(orgAdmin, input)).rejects.toThrow();
    expect(register).not.toHaveBeenCalled();
  });
});

describe("createWalkIn — propagation of register() outcomes", () => {
  it("propagates a COD pending result", async () => {
    mock(register).mockResolvedValue({ orderCode: "WALK2", status: "pending", approvalStatus: "not_required", magicLinkToken: "t" });
    const res = await createWalkIn(orgAdmin, input);
    expect(res.status).toBe("pending");
  });

  it("propagates a register() failure (e.g. seat required / sold out) without auditing", async () => {
    mock(register).mockRejectedValue(new Error("Seat selection is required for this event"));
    await expect(createWalkIn(orgAdmin, input)).rejects.toThrow(/seat/i);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
