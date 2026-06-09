import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/orders", () => ({
  markOrderPaid: vi.fn().mockResolvedValue({ status: "p" }),
  cancelOrder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import * as pretixOrders from "@/lib/pretix/orders";
import * as email from "@/lib/email/service";
import { approve, reject } from "@/lib/approval/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u3",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1"] }],
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderCode: "ABC12",
    email: "a@b.com",
    status: "pending",
    approvalStatus: "pending",
    provider: "manual_cod",
    totalCents: 2500,
    magicLinkToken: "tok",
    eventMapping: {
      id: "e1",
      organizationId: "orgA",
      localEventId: "loc1",
      pretixOrganizerSlug: "acme",
      pretixEventSlug: "expo",
      titleEn: "Expo",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  process.env.WEBHOOK_SECRET = "s";
  mock(prisma.organization.findUnique).mockResolvedValue({
    id: "orgA",
    pretixOrganizerSlug: "acme",
    pretixApiToken: null,
  });
  mock(prisma.attendeeOrder.update).mockImplementation(async ({ data }) => ({
    ...order(),
    ...data,
  }));
});

describe("approve — permissions", () => {
  it("blocks while impersonating", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await expect(approve({ ...orgAdmin, impersonating: true }, "o1")).rejects.toThrow(
      /impersonat/i,
    );
    expect(prisma.attendeeOrder.update).not.toHaveBeenCalled();
  });
  it("finance cannot approve", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await expect(approve(finance, "o1")).rejects.toThrow();
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
  });
  it("check-in staff cannot approve", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await expect(approve(staff, "o1")).rejects.toThrow();
  });
  it("denies cross-org", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ eventMapping: { ...order().eventMapping, organizationId: "orgB" } }),
    );
    await expect(approve(orgAdmin, "o1")).rejects.toThrow();
  });
});

describe("approve — outcomes", () => {
  it("free order → mark paid (issued) + ticket email + audit", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ provider: "free", totalCents: 0 }),
    );
    const res = await approve(orgAdmin, "o1");
    expect(pretixOrders.markOrderPaid).toHaveBeenCalled();
    const data = mock(prisma.attendeeOrder.update).mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("approved");
    expect(data.status).toBe("paid");
    expect(email.sendEmail).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(res.status).toBe("paid");
  });
  it("COD order → approved, stays pending_payment, no mark-paid", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    const res = await approve(orgAdmin, "o1");
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    const data = mock(prisma.attendeeOrder.update).mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("approved");
    expect(data.status).toBe("pending");
    expect(res.status).toBe("pending");
  });
});

describe("reject", () => {
  it("rejects: status canceled + cancel pretix + rejected email + audit", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await reject(orgAdmin, "o1");
    const data = mock(prisma.attendeeOrder.update).mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("rejected");
    expect(data.status).toBe("canceled");
    expect(pretixOrders.cancelOrder).toHaveBeenCalled();
    expect(email.sendEmail).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
  it("finance cannot reject", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await expect(reject(finance, "o1")).rejects.toThrow();
  });
});
