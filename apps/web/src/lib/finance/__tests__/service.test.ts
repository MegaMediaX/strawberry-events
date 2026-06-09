import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/orders", () => ({ markOrderPaid: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import * as pretixOrders from "@/lib/pretix/orders";
import * as email from "@/lib/email/service";
import {
  listFinanceOrders,
  getFinanceOrder,
  markOrderPaid,
} from "@/lib/finance/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const financeA: SessionContext = {
  userId: "u1",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const superAdmin: SessionContext = {
  userId: "u0",
  isSuperAdmin: true,
  memberships: [],
};

const orderA = {
  id: "o1",
  orderCode: "ABC12",
  email: "a@b.com",
  status: "pending",
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
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  process.env.WEBHOOK_SECRET = "s";
  mock(prisma.organization.findUnique).mockResolvedValue({
    id: "orgA",
    pretixOrganizerSlug: "acme",
    pretixApiToken: null,
  });
});

describe("listFinanceOrders", () => {
  it("scopes to the finance user's org and applies filters", async () => {
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    await listFinanceOrders(financeA, { status: "pending", provider: "manual_cod" });
    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    expect(where.eventMapping.organizationId.in).toEqual(["orgA"]);
    expect(where.status).toBe("pending");
    expect(where.provider).toBe("manual_cod");
  });

  it("does not constrain org for super admin", async () => {
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
    await listFinanceOrders(superAdmin, {});
    const where = mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where;
    expect(where.eventMapping).toBeUndefined();
  });
});

describe("getFinanceOrder", () => {
  it("returns null when the order is in another org", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({
      ...orderA,
      eventMapping: { ...orderA.eventMapping, organizationId: "orgB" },
    });
    expect(await getFinanceOrder(financeA, "o1")).toBeNull();
  });
});

describe("markOrderPaid", () => {
  it("refuses while impersonating, with no side effects", async () => {
    await expect(
      markOrderPaid({ ...financeA, impersonating: true }, "o1"),
    ).rejects.toThrow(/impersonat/i);
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    expect(prisma.attendeeOrder.update).not.toHaveBeenCalled();
  });

  it("denies cross-org", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({
      ...orderA,
      eventMapping: { ...orderA.eventMapping, organizationId: "orgB" },
    });
    await expect(markOrderPaid(financeA, "o1")).rejects.toThrow();
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
  });

  it("marks paid: pretix + status + email + audit", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue(orderA);
    mock(prisma.attendeeOrder.update).mockResolvedValue({ ...orderA, status: "paid" });
    mock(pretixOrders.markOrderPaid).mockResolvedValue({ status: "p" });

    const res = await markOrderPaid(financeA, "o1");

    expect(pretixOrders.markOrderPaid).toHaveBeenCalledWith("acme", "expo", "ABC12", "env_tok");
    expect(mock(prisma.attendeeOrder.update).mock.calls[0][0].data.status).toBe("paid");
    expect(email.sendEmail).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(res.status).toBe("paid");
  });

  it("is idempotent when already paid", async () => {
    mock(prisma.attendeeOrder.findUnique).mockResolvedValue({ ...orderA, status: "paid" });
    await markOrderPaid(financeA, "o1");
    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
