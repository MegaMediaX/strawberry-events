import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    attendeeOrder: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/products", () => ({ listItems: vi.fn() }));
vi.mock("@/lib/pretix/orders", () => ({
  createOrder: vi.fn(),
  markOrderPaid: vi.fn(),
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/db/client";
import * as pretixProducts from "@/lib/pretix/products";
import * as pretixOrders from "@/lib/pretix/orders";
import * as email from "@/lib/email/service";
import { register } from "@/lib/registration/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  process.env.WEBHOOK_SECRET = "s";
  process.env.APP_URL = "https://x";
  mock(prisma.eventMapping.findFirst).mockResolvedValue({
    id: "e1",
    titleEn: "Expo",
    pretixEventSlug: "expo",
    organizationId: "orgA",
    visibility: "public",
    approvalMode: "none",
    autoApproveItemIds: [],
  });
  mock(prisma.organization.findUnique).mockResolvedValue({
    id: "orgA",
    pretixOrganizerSlug: "acme",
    pretixApiToken: null,
  });
  mock(prisma.attendeeOrder.create).mockImplementation(async ({ data }) => ({
    ...data,
    id: "ao1",
  }));
  mock(email.sendEmail).mockResolvedValue(true);
});

const base = {
  eventSlug: "expo",
  locale: "en" as const,
  attendee: {
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    phoneCC: "+961",
    phone: "70123456",
  },
  consentTerms: true as const,
  consentPrivacy: true as const,
};

describe("register", () => {
  it("free event → paid order + QR + confirmation email", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "Free", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "FREE1", status: "n" });
    mock(pretixOrders.markOrderPaid).mockResolvedValue({ code: "FREE1", status: "p" });

    const res = await register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] });

    expect(pretixOrders.markOrderPaid).toHaveBeenCalled();
    expect(res.status).toBe("paid");
    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.status).toBe("paid");
    expect(mock(email.sendEmail).mock.calls[0][0].subject).toContain("ticket");
  });

  it("COD event → pending order + pending email, no mark-paid", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "Visitor", titleAr: null, priceCents: 2500, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "COD1", status: "n" });

    const res = await register({ ...base, tickets: [{ itemId: 7, quantity: 2 }] });

    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    expect(res.status).toBe("pending");
    expect(mock(prisma.attendeeOrder.create).mock.calls[0][0].data.status).toBe("pending");
  });

  it("email failure does not break registration", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 2500, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "COD2", status: "n" });
    mock(email.sendEmail).mockRejectedValue(new Error("smtp down"));

    const res = await register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] });
    expect(res.orderCode).toBe("COD2");
  });

  it("approval-required free event → pending_approval, no mark-paid", async () => {
    mock(prisma.eventMapping.findFirst).mockResolvedValue({
      id: "e1",
      titleEn: "Expo",
      pretixEventSlug: "expo",
      organizationId: "orgA",
      visibility: "public",
      approvalMode: "manual",
      autoApproveItemIds: [],
    });
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "Media", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "APR1", status: "n" });

    const res = await register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] });

    expect(pretixOrders.markOrderPaid).not.toHaveBeenCalled();
    expect(res.approvalStatus).toBe("pending");
    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("pending");
    expect(data.status).toBe("pending");
    expect(mock(email.sendEmail).mock.calls[0][0].subject).toMatch(/review/i);
  });

  it("seated event requires seat selection", async () => {
    mock(prisma.eventMapping.findFirst).mockResolvedValue({
      id: "e1",
      titleEn: "Seated",
      pretixEventSlug: "expo",
      organizationId: "orgA",
      visibility: "public",
      approvalMode: "none",
      autoApproveItemIds: [],
      seatSelectionEnabled: true,
    });
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    await expect(
      register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] }),
    ).rejects.toThrow(/seat selection/i);
  });

  it("rejects missing consent", async () => {
    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        consentTerms: false as never,
      }),
    ).rejects.toThrow();
  });
});
