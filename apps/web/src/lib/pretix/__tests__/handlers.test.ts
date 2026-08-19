import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findFirst: vi.fn(), updateMany: vi.fn() },
    badgePrintLog: { count: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/orders", () => ({ getOrder: vi.fn() }));
vi.mock("@/lib/seats/service", () => ({ releaseSeats: vi.fn() }));
vi.mock("@/lib/webhooks/service", () => ({ emit: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { getOrder } from "@/lib/pretix/orders";
import { releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import { sendEmail } from "@/lib/email/service";
import { handleOrderPaid } from "@/lib/pretix/handlers/order-paid";
import { handleOrderCanceled } from "@/lib/pretix/handlers/order-canceled";
import { handleCheckinCreated } from "@/lib/pretix/handlers/checkin-created";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const ctx = {
  organizerSlug: "acme",
  pretixEventSlug: "expo",
  token: "tok",
  orderCode: "ABC12",
  eventMappingId: "e1",
  organizationId: "orgA",
};

const order = (o: Record<string, unknown> = {}) => ({
  id: "o1",
  orderCode: "ABC12",
  status: "pending",
  approvalStatus: "not_required",
  magicLinkToken: "mlt",
  email: "a@b.com",
  userId: null,
  eventMapping: { titleEn: "Expo" },
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://app";
  mock(getOrder).mockResolvedValue({ positions: [{ secret: "SEC1" }] });
  mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 1 });
});

describe("handleOrderPaid", () => {
  it("is a no-op when the order is already paid", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ status: "paid" }));
    await handleOrderPaid(ctx);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("returns quietly when the order is unknown to the platform", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    await expect(handleOrderPaid(ctx)).resolves.toBeUndefined();
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
  });

  it("marks paid, backfills the secret, and issues when no approval is required", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order());
    await handleOrderPaid(ctx);
    const arg = mock(prisma.attendeeOrder.updateMany).mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "o1", status: "pending" });
    expect(arg.data).toMatchObject({ status: "paid", pretixSecret: "SEC1" });
    const events = mock(emit).mock.calls.map((c) => c[1]);
    expect(events).toContain("order.paid");
    expect(events).toContain("ticket.issued");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("marks paid but does NOT issue when approval is still pending", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ approvalStatus: "pending" }));
    await handleOrderPaid(ctx);
    expect(prisma.attendeeOrder.updateMany).toHaveBeenCalled();
    const events = mock(emit).mock.calls.map((c) => c[1]);
    expect(events).not.toContain("ticket.issued");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not issue when a concurrent delivery already won (count 0)", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order());
    mock(prisma.attendeeOrder.updateMany).mockResolvedValue({ count: 0 });
    await handleOrderPaid(ctx);
    const events = mock(emit).mock.calls.map((c) => c[1]);
    expect(events).not.toContain("ticket.issued");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("handleOrderCanceled", () => {
  it("returns quietly when already canceled", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ status: "canceled" }));
    await handleOrderCanceled(ctx);
    expect(prisma.attendeeOrder.updateMany).not.toHaveBeenCalled();
    expect(releaseSeats).not.toHaveBeenCalled();
  });

  it("cancels, releases seats, emits seat.released, and emails the attendee", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order());
    await handleOrderCanceled(ctx);
    const arg = mock(prisma.attendeeOrder.updateMany).mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "canceled" });
    expect(releaseSeats).toHaveBeenCalledWith("ABC12");
    expect(mock(emit).mock.calls.map((c) => c[1])).toContain("seat.released");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(mock(sendEmail).mock.calls[0][1]).toMatchObject({ templateType: "order_canceled" });
  });
});

describe("handleCheckinCreated", () => {
  it("skips when the order is not found", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    await handleCheckinCreated(ctx);
    expect(prisma.badgePrintLog.create).not.toHaveBeenCalled();
  });

  it("skips when the order is not eligible (still pending payment)", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(order({ status: "pending" }));
    await handleCheckinCreated(ctx);
    expect(prisma.badgePrintLog.create).not.toHaveBeenCalled();
  });

  it("logs a system badge print + audit and emits for an issued order", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(
      order({ status: "paid", approvalStatus: "not_required" }),
    );
    mock(prisma.badgePrintLog.count).mockResolvedValue(0);
    await handleCheckinCreated(ctx);
    const badge = mock(prisma.badgePrintLog.create).mock.calls[0][0].data;
    expect(badge).toMatchObject({ attendeeRef: "ABC12", printedByUserId: null, reprint: false });
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(mock(emit).mock.calls.map((c) => c[1])).toContain("checkin.created");
  });

  it("marks reprint=true when a badge log already exists", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(
      order({ status: "paid", approvalStatus: "not_required" }),
    );
    mock(prisma.badgePrintLog.count).mockResolvedValue(1);
    await handleCheckinCreated(ctx);
    expect(mock(prisma.badgePrintLog.create).mock.calls[0][0].data.reprint).toBe(true);
  });
});
