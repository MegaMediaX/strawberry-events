import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/context", () => ({
  resolvePretixContext: () => ({ organizerSlug: "acme", token: "tok" }),
}));
vi.mock("@/lib/pretix/orders", () => ({ cancelOrder: vi.fn() }));
vi.mock("@/lib/seats/service", () => ({ releaseSeats: vi.fn() }));
vi.mock("@/lib/webhooks/service", () => ({ emit: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/email/recipient-locale", () => ({ recipientLocale: () => Promise.resolve("en") }));

import { prisma } from "@/lib/db/client";
import * as pretixOrders from "@/lib/pretix/orders";
import { releaseSeats } from "@/lib/seats/service";
import { PretixValidationError } from "@/lib/pretix/errors";
import { cancelRegistration } from "@/lib/registration/cancel";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u3", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const issuedOrder = (o: Record<string, unknown> = {}) => ({
  id: "o1", orderCode: "ABC12", status: "paid", userId: "u9", email: "a@b.com",
  eventMappingId: "e1",
  eventMapping: { id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo", titleEn: "Expo" },
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  m(prisma.organization.findUnique).mockResolvedValue({ id: "orgA", pretixOrganizerSlug: "acme" });
  m(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 1 });
});

describe("cancelRegistration", () => {
  it("cancels an issued order: pretix first, then status + seat release + audit", async () => {
    m(prisma.attendeeOrder.findUnique).mockResolvedValue(issuedOrder());
    const res = await cancelRegistration(orgAdmin, "o1");

    expect(pretixOrders.cancelOrder).toHaveBeenCalledWith("acme", "expo", "ABC12", "tok");
    expect(m(prisma.attendeeOrder.updateMany).mock.calls[0][0].data).toEqual({ status: "canceled" });
    expect(releaseSeats).toHaveBeenCalledWith("ABC12");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "order.canceled" }) }),
    );
    expect(res.status).toBe("canceled");
  });

  it("is idempotent on an already-canceled order (no pretix call)", async () => {
    m(prisma.attendeeOrder.findUnique).mockResolvedValue(issuedOrder({ status: "canceled" }));
    await cancelRegistration(orgAdmin, "o1");
    expect(pretixOrders.cancelOrder).not.toHaveBeenCalled();
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });

  it("denies an order in another org", async () => {
    m(prisma.attendeeOrder.findUnique).mockResolvedValue(
      issuedOrder({ eventMapping: { id: "e1", organizationId: "orgB", localEventId: "loc1", pretixEventSlug: "x", titleEn: "X" } }),
    );
    await expect(cancelRegistration(orgAdmin, "o1")).rejects.toThrow();
    expect(pretixOrders.cancelOrder).not.toHaveBeenCalled();
  });

  it("denies finance role", async () => {
    await expect(cancelRegistration(finance, "o1")).rejects.toThrow(/organizer admin|super admin/i);
    expect(prisma.attendeeOrder.findUnique).not.toHaveBeenCalled();
  });

  it("denies an impersonating session", async () => {
    await expect(cancelRegistration({ ...orgAdmin, impersonating: true }, "o1")).rejects.toThrow(/impersonat/i);
  });

  it("does NOT change local status when pretix cancel fails for a real error", async () => {
    m(prisma.attendeeOrder.findUnique).mockResolvedValue(issuedOrder());
    m(pretixOrders.cancelOrder).mockRejectedValue(new Error("pretix down"));
    await expect(cancelRegistration(orgAdmin, "o1")).rejects.toThrow(/sync with pretix failed/i);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "order.cancel_failed", success: false }) }),
    );
  });

  it("tolerates pretix already-canceled (PretixValidationError) and still reconciles locally", async () => {
    m(prisma.attendeeOrder.findUnique).mockResolvedValue(issuedOrder());
    m(pretixOrders.cancelOrder).mockRejectedValue(new PretixValidationError("already canceled", {}));
    const res = await cancelRegistration(orgAdmin, "o1");
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalled();
    expect(res.status).toBe("canceled");
  });
});
