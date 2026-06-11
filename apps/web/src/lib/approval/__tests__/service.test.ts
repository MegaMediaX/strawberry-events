import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";
import { registrationState } from "@/lib/approval/state";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
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
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u3", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: ["loc1"] }],
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1", orderCode: "ABC12", email: "a@b.com",
    status: "pending", approvalStatus: "pending",
    provider: "manual_cod", totalCents: 2500, magicLinkToken: "tok",
    eventMapping: {
      id: "e1", organizationId: "orgA", localEventId: "loc1",
      pretixOrganizerSlug: "acme", pretixEventSlug: "expo", titleEn: "Expo",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  process.env.WEBHOOK_SECRET = "s";
  mock(prisma.organization.findUnique).mockResolvedValue({
    id: "orgA", pretixOrganizerSlug: "acme", pretixApiToken: null,
  });
  mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 1 });
});

describe("approve — permissions", () => {
  it("blocks while impersonating", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await expect(approve({ ...orgAdmin, impersonating: true }, "o1")).rejects.toThrow(/impersonat/i);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
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
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order({ provider: "free", totalCents: 0 }));
    const res = await approve(orgAdmin, "o1");
    expect(pretixOrders.markOrderPaid).toHaveBeenCalled();
    const data = mock(prisma.attendeeOrder.updateMany).mock.calls[0][0].data;
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
    const data = mock(prisma.attendeeOrder.updateMany).mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(res.status).toBe("pending");
  });
});

describe("approve — idempotency / state guards (H1)", () => {
  it("approving an already-approved registration is idempotent (no re-issue)", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "approved", status: "paid", provider: "free", totalCents: 0 }),
    );
    const res = await approve(orgAdmin, "o1");
    expect(res.approvalStatus).toBe("approved");
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
  it("approving a paid COD (already approved) does not break finance state", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "approved", status: "paid", provider: "manual_cod" }),
    );
    const res = await approve(orgAdmin, "o1");
    expect(res.status).toBe("paid");
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });
  it("cannot approve a rejected registration", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "rejected", status: "canceled" }),
    );
    await expect(approve(orgAdmin, "o1")).rejects.toThrow();
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("reject", () => {
  it("rejects: status canceled + cancel pretix + rejected email + audit", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(order());
    await reject(orgAdmin, "o1");
    const data = mock(prisma.attendeeOrder.updateMany).mock.calls[0][0].data;
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

describe("reject — idempotency / state guards (H1)", () => {
  it("rejecting an already-rejected registration is idempotent", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "rejected", status: "canceled" }),
    );
    await reject(orgAdmin, "o1");
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
    expect(pretixOrders.cancelOrder).not.toHaveBeenCalled();
  });
  it("blocks rejecting an issued (paid) ticket", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "approved", status: "paid" }),
    );
    await expect(reject(orgAdmin, "o1")).rejects.toThrow(/issued|approved/i);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });
  it("blocks rejecting a checked-in (paid/issued) ticket", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      order({ approvalStatus: "approved", status: "paid", provider: "free", totalCents: 0 }),
    );
    await expect(reject(orgAdmin, "o1")).rejects.toThrow();
  });
  it("a rejected registration never resolves to issued (no QR)", () => {
    expect(registrationState({ approvalStatus: "rejected", status: "canceled" })).toBe("rejected");
  });
});

describe("approve — payBeforeApproval enforcement", () => {
  const payFirst = (o: Record<string, unknown> = {}) =>
    order({ eventMapping: { ...order().eventMapping, payBeforeApproval: true }, ...o });

  it("blocks approving an unpaid paid-tier order when the event requires pay-first", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(payFirst({ status: "pending" }));
    await expect(approve(orgAdmin, "o1")).rejects.toThrow(/payment must be completed/i);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });

  it("allows approval once the order is paid", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(payFirst({ status: "paid" }));
    await approve(orgAdmin, "o1");
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalled();
  });

  it("exempts free orders (nothing to pay)", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(
      payFirst({ status: "pending", provider: "free", totalCents: 0 }),
    );
    await approve(orgAdmin, "o1");
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalled();
  });
});
