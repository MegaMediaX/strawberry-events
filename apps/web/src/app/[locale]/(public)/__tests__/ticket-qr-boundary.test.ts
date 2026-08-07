import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/registration/access", () => ({
  getOrderByCode: vi.fn(),
  getOrderByToken: vi.fn(),
}));
vi.mock("@/lib/security/order-lookup", () => ({ allowOrderCodeLookup: vi.fn() }));
// Stubbed so the assertions are about what each route hands the view, not about
// rendering it (component-level rendering is covered in attendee-state-view.test).
vi.mock("@/components/public/attendee-state-view", () => ({ AttendeeStateView: () => null }));
vi.mock("@/components/public/resend-ticket-link", () => ({ ResendTicketLink: () => null }));
vi.mock("@/components/public/too-many-requests", () => ({ TooManyRequests: () => null }));

import { getOrderByCode, getOrderByToken } from "@/lib/registration/access";
import { allowOrderCodeLookup } from "@/lib/security/order-lookup";
import { AttendeeStateView } from "@/components/public/attendee-state-view";
import { TooManyRequests } from "@/components/public/too-many-requests";
import ConfirmationPage from "../events/[slug]/confirmation/[orderCode]/page";
import GuestTicketPage from "../t/[token]/page";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

type Rendered = { type: unknown; props: Record<string, unknown> };
const asElement = (node: unknown) => node as unknown as Rendered;

const order = {
  orderCode: "3XKQ7",
  status: "paid",
  approvalStatus: "not_required",
  pretixSecret: "pretix-position-secret-abc123",
  eventMapping: { titleEn: "Demo Expo" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(allowOrderCodeLookup).mockResolvedValue(true);
});

describe("confirmation page (addressed by guessable order code)", () => {
  it("never grants QR authorization to the attendee view", async () => {
    mock(getOrderByCode).mockResolvedValue(order);
    const el = asElement(
      await ConfirmationPage({
        params: Promise.resolve({ locale: "en", slug: "demo-expo", orderCode: "3XKQ7" }),
      }),
    );
    expect(el.type).toBe(AttendeeStateView);
    // Absent, not merely false — the view defaults to withholding the secret.
    expect(el.props.canRevealTicket).toBeUndefined();
  });

  it("scopes the lookup to the event slug and offers the email recovery path", async () => {
    mock(getOrderByCode).mockResolvedValue(order);
    const el = asElement(
      await ConfirmationPage({
        params: Promise.resolve({ locale: "en", slug: "demo-expo", orderCode: "3XKQ7" }),
      }),
    );
    expect(getOrderByCode).toHaveBeenCalledWith("3XKQ7", "demo-expo");
    expect(el.props.ticketRecovery).toBeTruthy();
  });

  it("still resolves an unknown code to a plain 404 (no bespoke signal)", async () => {
    mock(getOrderByCode).mockResolvedValue(null);
    await expect(
      ConfirmationPage({
        params: Promise.resolve({ locale: "en", slug: "demo-expo", orderCode: "ZZZZZ" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("throttles before the database read so a scraper gets no lookup at all", async () => {
    mock(allowOrderCodeLookup).mockResolvedValue(false);
    const el = asElement(
      await ConfirmationPage({
        params: Promise.resolve({ locale: "en", slug: "demo-expo", orderCode: "3XKQ7" }),
      }),
    );
    expect(el.type).toBe(TooManyRequests);
    expect(getOrderByCode).not.toHaveBeenCalled();
  });
});

describe("magic-link page (HMAC-signed token)", () => {
  it("is the one surface that grants QR authorization", async () => {
    mock(getOrderByToken).mockResolvedValue(order);
    const el = asElement(
      await GuestTicketPage({ params: Promise.resolve({ locale: "en", token: "M1RB.sig" }) }),
    );
    expect(el.type).toBe(AttendeeStateView);
    expect(el.props.canRevealTicket).toBe(true);
  });

  it("404s on a tampered token without rendering the view", async () => {
    mock(getOrderByToken).mockResolvedValue(null);
    await expect(
      GuestTicketPage({ params: Promise.resolve({ locale: "en", token: "forged" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is not rate limited — existing emailed ticket links must keep working", async () => {
    mock(getOrderByToken).mockResolvedValue(order);
    await GuestTicketPage({ params: Promise.resolve({ locale: "en", token: "M1RB.sig" }) });
    expect(allowOrderCodeLookup).not.toHaveBeenCalled();
  });
});
