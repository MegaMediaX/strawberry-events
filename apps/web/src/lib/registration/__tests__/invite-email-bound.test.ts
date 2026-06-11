/**
 * Tests for Phase B email-bound invite enforcement in register().
 *
 * Pure guards (assertEmailMatches) are tested directly.
 * The register() path is tested via the existing prisma/pretix mocks extended
 * with invite.findUnique and invite.update.
 */
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
    invite: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
import { register, assertEmailMatches } from "@/lib/registration/service";
import { signInvite } from "@/lib/tokens/invite";
import { sha256 } from "@/lib/crypto";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const base = {
  eventSlug: "expo",
  locale: "en" as const,
  attendee: {
    firstName: "Alice",
    lastName: "Test",
    email: "alice@example.com",
    phoneCC: "+961",
    phone: "70000000",
  },
  consentTerms: true as const,
  consentPrivacy: true as const,
};

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
    inviteOnlyItemIds: [7],
    ticketsPerUserMain: 10,
    ticketsPerUserTotal: 10,
    itemTagMap: {},
    seatSelectionEnabled: false,
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
  mock(prisma.invite.update).mockResolvedValue({});
  // Atomic single-use claim succeeds by default (one row transitioned to redeemed).
  mock(prisma.invite.updateMany).mockResolvedValue({ count: 1 });
  mock(email.sendEmail).mockResolvedValue(true);
  mock(prisma.customFormField.findMany).mockResolvedValue([]);
  mock(prisma.customFormAnswer.createMany).mockResolvedValue({ count: 0 });
  mock(pretixProducts.listItems).mockResolvedValue([
    { id: 7, titleEn: "VIP", titleAr: null, priceCents: 0, active: true },
  ]);
  mock(pretixOrders.createOrder).mockResolvedValue({ code: "INV1", status: "n" });
  mock(pretixOrders.markOrderPaid).mockResolvedValue({ code: "INV1", status: "p" });
});

// ── Pure guard tests ────────────────────────────────────────────────────────

describe("assertEmailMatches", () => {
  it("passes when payload has no email (stateless link)", () => {
    expect(() => assertEmailMatches({ ev: "expo", items: [7] }, "alice@example.com")).not.toThrow();
  });

  it("passes when emails match (case-insensitive)", () => {
    expect(() =>
      assertEmailMatches({ ev: "expo", items: [7], email: "Alice@Example.COM" }, "alice@example.com"),
    ).not.toThrow();
  });

  it("throws when emails differ", () => {
    expect(() =>
      assertEmailMatches({ ev: "expo", items: [7], email: "other@example.com" }, "alice@example.com"),
    ).toThrow("different email address");
  });
});

// ── Integration: register() with email-bound invite ─────────────────────────

function makeToken(email: string) {
  return signInvite({ ev: "expo", items: [7], email });
}

describe("register() – email-bound invite", () => {
  it("succeeds and marks invite redeemed when email matches and invite is unredeemed", async () => {
    const token = makeToken("alice@example.com");
    const tokenHash = sha256(token);

    mock(prisma.invite.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash,
      redeemedAt: null,
      expiresAt: null,
    });

    const res = await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      inviteToken: token,
    });

    expect(res.orderCode).toBe("INV1");
    // Atomic claim: compare-and-set keyed on redeemedAt:null (the single-use guard).
    expect(mock(prisma.invite.updateMany).mock.calls[0][0]).toMatchObject({
      where: { tokenHash, redeemedAt: null },
      data: { redeemedAt: expect.any(Date) },
    });
    // Finalize: bind the claimed invite to the committed order.
    expect(mock(prisma.invite.update).mock.calls[0][0]).toMatchObject({
      where: { tokenHash },
      data: { redeemedOrderCode: "INV1" },
    });
  });

  it("rejects a concurrent double-redeem: loser of the atomic claim is turned away", async () => {
    const token = makeToken("alice@example.com");
    mock(prisma.invite.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash: sha256(token),
      redeemedAt: null,
      expiresAt: null,
    });
    // The read passes (redeemedAt null), but the atomic claim loses the race —
    // a concurrent registration already flipped redeemedAt, so 0 rows match.
    mock(prisma.invite.updateMany).mockResolvedValue({ count: 0 });

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("already been used");

    // Must abort BEFORE creating a pretix order — no double order, no double seat.
    expect(pretixOrders.createOrder).not.toHaveBeenCalled();
  });

  it("releases the invite claim if order creation fails (genuine retry possible)", async () => {
    const token = makeToken("alice@example.com");
    mock(prisma.invite.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash: sha256(token),
      redeemedAt: null,
      expiresAt: null,
    });
    mock(pretixOrders.createOrder).mockRejectedValueOnce(new Error("pretix down"));

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("pretix down");

    // Claim (1st updateMany) then release (2nd updateMany resetting redeemedAt:null).
    const calls = mock(prisma.invite.updateMany).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1][0]).toMatchObject({
      where: { tokenHash: sha256(token), redeemedOrderCode: null },
      data: { redeemedAt: null },
    });
  });

  it("throws when the registrant email does not match the invite email", async () => {
    const token = makeToken("other@example.com");

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("different email address");

    expect(prisma.invite.findUnique).not.toHaveBeenCalled();
  });

  it("throws when the invite record is not found in DB", async () => {
    const token = makeToken("alice@example.com");
    mock(prisma.invite.findUnique).mockResolvedValue(null);

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("Invitation not found");
  });

  it("throws when the invite has already been redeemed", async () => {
    const token = makeToken("alice@example.com");
    mock(prisma.invite.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash: sha256(token),
      redeemedAt: new Date("2026-01-01"),
      expiresAt: null,
    });

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("already been used");
  });

  it("throws when the invite has expired (DB expiry)", async () => {
    const token = makeToken("alice@example.com");
    mock(prisma.invite.findUnique).mockResolvedValue({
      id: "inv1",
      tokenHash: sha256(token),
      redeemedAt: null,
      expiresAt: new Date("2020-01-01"), // past
    });

    await expect(
      register({
        ...base,
        tickets: [{ itemId: 7, quantity: 1 }],
        inviteToken: token,
      }),
    ).rejects.toThrow("expired");
  });

  it("stateless link (no email in payload) is unaffected — no invite DB lookup", async () => {
    // Override event to have no invite-only items so the stateless link passes assertInviteAllows.
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
      itemTagMap: {},
      seatSelectionEnabled: false,
    });

    const token = signInvite({ ev: "expo", items: [7] }); // no email field

    const res = await register({
      ...base,
      tickets: [{ itemId: 7, quantity: 1 }],
      inviteToken: token,
    });

    expect(res.orderCode).toBe("INV1");
    expect(prisma.invite.findUnique).not.toHaveBeenCalled();
    expect(prisma.invite.update).not.toHaveBeenCalled();
  });
});
