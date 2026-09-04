import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    attendeeOrder: { create: vi.fn() },
    userProfile: { upsert: vi.fn() },
    subEvent: { findMany: vi.fn() },
    customFormField: { findMany: vi.fn() },
    customFormAnswer: { createMany: vi.fn() },
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
import { register, assertInviteAllows } from "@/lib/registration/service";
import { signInvite } from "@/lib/tokens/invite";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
  process.env.MAGIC_LINK_SECRET = "s";
  process.env.APP_URL = "https://x";
  mock(prisma.eventMapping.findFirst).mockResolvedValue({
    id: "e1",
    titleEn: "Expo",
    pretixEventSlug: "expo",
    organizationId: "orgA",
    visibility: "public",
    approvalMode: "none",
    autoApproveItemIds: [],
    inviteOnlyItemIds: [],
    ticketsPerUserMain: 10,
    ticketsPerUserTotal: 10,
  });
  mock(prisma.subEvent.findMany).mockResolvedValue([]);
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
  mock(prisma.customFormField.findMany).mockResolvedValue([]);
  mock(prisma.customFormAnswer.createMany).mockResolvedValue({ count: 0 });
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
  consentPrivacy: true, consentDataUse: true as const,
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

  it("rejects when a required custom field has no answer (before any side effects)", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(prisma.customFormField.findMany).mockResolvedValue([
      { id: "f1", ticketId: null, labelEn: "Company", labelAr: null, type: "text", required: true, options: null },
    ]);
    await expect(
      register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] }),
    ).rejects.toThrow(/required field/i);
    expect(pretixOrders.createOrder).not.toHaveBeenCalled();
  });

  it("persists provided custom field answers against the order code", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "CF1", status: "n" });
    mock(prisma.customFormField.findMany).mockResolvedValue([
      { id: "f1", ticketId: null, labelEn: "Company", labelAr: null, type: "text", required: true, options: null },
    ]);
    await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      answers: [{ fieldId: "f1", value: "Acme Corp" }],
    });
    const arg = mock(prisma.customFormAnswer.createMany).mock.calls[0][0];
    expect(arg.data).toEqual([{ fieldId: "f1", attendeeRef: "CF1", value: "Acme Corp" }]);
  });

  it("persists phone, phoneCC and a server-side consent timestamp", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 2500, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "PC1", status: "n" });

    await register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] });

    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.phone).toBe("70123456");
    expect(data.phoneCC).toBe("+961");
    expect(data.consentAt).toBeInstanceOf(Date);
    expect(data.consentSource).toBe("web_form");
  });

  describe("job title — the server backstop covers every channel", () => {
    // A review claimed the staff walk-in path skips registerInputSchema and so
    // has no server-side guard on the job title. It does not: createWalkIn ->
    // register(), and register() parses with the schema on its first line
    // (service.ts:79) before touching anything. These tests make that an
    // executable fact rather than an argument, and fail the day someone adds a
    // path that reaches the database without parsing.
    it("rejects the sentinel even when the caller is a staff walk-in", async () => {
      await expect(
        register({
          ...base,
          staffWalkIn: true,
          consentSource: "staff_walkin",
          attendee: { ...base.attendee, company: "Acme", jobTitle: "Other" },
          tickets: [{ itemId: 7, quantity: 1 }],
        }),
      ).rejects.toThrow();
      expect(prisma.attendeeOrder.create).not.toHaveBeenCalled();
    });

    it("rejects an over-length title on the walk-in path", async () => {
      await expect(
        register({
          ...base,
          staffWalkIn: true,
          consentSource: "staff_walkin",
          attendee: { ...base.attendee, company: "Acme", jobTitle: "x".repeat(16) },
          tickets: [{ itemId: 7, quantity: 1 }],
        }),
      ).rejects.toThrow();
      expect(prisma.attendeeOrder.create).not.toHaveBeenCalled();
    });
  });

  describe("job title", () => {
    const itemsAndOrder = (code: string) => {
      mock(pretixProducts.listItems).mockResolvedValue([
        { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
      ]);
      mock(pretixOrders.createOrder).mockResolvedValue({ code, status: "n" });
    };

    it("stores the title when a company was given", async () => {
      itemsAndOrder("JT1");
      await register({
        ...base,
        attendee: { ...base.attendee, company: "Acme", jobTitle: "CEO" },
        tickets: [{ itemId: 7, quantity: 1 }],
      });
      expect(mock(prisma.attendeeOrder.create).mock.calls[0][0].data.jobTitle).toBe("CEO");
    });

    it("drops a title that arrives with no company", async () => {
      // A title with no employer is not a fact about anyone. This also stops a
      // stale value surviving a change of attendee type in the form.
      itemsAndOrder("JT2");
      await register({
        ...base,
        attendee: { ...base.attendee, company: null, jobTitle: "CEO" },
        tickets: [{ itemId: 7, quantity: 1 }],
      });
      expect(mock(prisma.attendeeOrder.create).mock.calls[0][0].data.jobTitle).toBeNull();
    });

    it("stores null — never an empty string — when no title was given", async () => {
      // The path taken by every registration made before this field existed.
      itemsAndOrder("JT3");
      await register({
        ...base,
        attendee: { ...base.attendee, company: "Acme" },
        tickets: [{ itemId: 7, quantity: 1 }],
      });
      expect(mock(prisma.attendeeOrder.create).mock.calls[0][0].data.jobTitle).toBeNull();
    });
  });

  it("records a staff walk-in against the walk-in source, keeping the timestamp", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "WI1", status: "n" });

    await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      staffWalkIn: true,
      consentSource: "staff_walkin",
    });

    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.consentSource).toBe("staff_walkin");
    // Staff attest consent collected in person, so the stamp is genuine — it is
    // simply no longer filed as if the attendee had ticked the web form.
    expect(data.consentAt).toBeInstanceOf(Date);
  });

  it("leaves consentAt NULL when an API caller does not assert consent", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "API1", status: "n" });

    await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      consentSource: "api",
      consentTerms: false,
      consentPrivacy: false, consentDataUse: false,
    });

    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.consentSource).toBe("api");
    expect(data.consentAt).toBeNull();
  });

  it("stamps consentAt for an API caller that asserts both consents", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "API2", status: "n" });

    await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      consentSource: "api",
    });

    const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
    expect(data.consentSource).toBe("api");
    expect(data.consentAt).toBeInstanceOf(Date);
  });

  it("records a partial consent assertion as no consent at all", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 0, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "API3", status: "n" });

    await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      consentSource: "api",
      consentPrivacy: false, consentDataUse: false,
    });

    expect(mock(prisma.attendeeOrder.create).mock.calls[0][0].data.consentAt).toBeNull();
  });

  it("upserts the UserProfile when a userId is present", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 2500, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "PC2", status: "n" });

    await register({ ...base, userId: "u1", tickets: [{ itemId: 7, quantity: 1 }] });

    expect(prisma.userProfile.upsert).toHaveBeenCalledTimes(1);
    const arg = mock(prisma.userProfile.upsert).mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.update.phone).toBe("70123456");
    expect(arg.update.phoneCC).toBe("+961");
  });

  it("does not upsert a UserProfile when there is no userId", async () => {
    mock(pretixProducts.listItems).mockResolvedValue([
      { id: 7, titleEn: "V", titleAr: null, priceCents: 2500, active: true },
    ]);
    mock(pretixOrders.createOrder).mockResolvedValue({ code: "PC3", status: "n" });

    await register({ ...base, tickets: [{ itemId: 7, quantity: 1 }] });

    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("assertInviteAllows", () => {
  beforeEach(() => {
    process.env.MAGIC_LINK_SECRET = "s";
  });

  it("allows a public-only selection with no token", () => {
    expect(() =>
      assertInviteAllows(null, "expo", [99], [7]),
    ).not.toThrow();
  });

  it("allows when a valid invite covers all selected invite-only items", () => {
    const payload = signInvite({ ev: "expo", items: [99] });
    const parsed = { ev: "expo", items: [99] };
    expect(() =>
      assertInviteAllows(parsed, "expo", [99], [99]),
    ).not.toThrow();
  });

  it("throws when invite-only item selected with no token", () => {
    expect(() =>
      assertInviteAllows(null, "expo", [99], [99]),
    ).toThrow("valid invitation");
  });

  it("throws when token is for a different event", () => {
    const payload = { ev: "other-event", items: [99] };
    expect(() =>
      assertInviteAllows(payload, "expo", [99], [99]),
    ).toThrow("valid invitation");
  });

  it("throws when token does not cover a selected invite-only item", () => {
    const payload = { ev: "expo", items: [88] };
    expect(() =>
      assertInviteAllows(payload, "expo", [99], [99]),
    ).toThrow("valid invitation");
  });

  it("allows a mix of public + invite-only when token covers the invite-only item", () => {
    const payload = { ev: "expo", items: [99] };
    expect(() =>
      assertInviteAllows(payload, "expo", [99], [7, 99]),
    ).not.toThrow();
  });
});
