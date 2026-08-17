import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registration/access", () => ({ getOrderByCode: vi.fn() }));
vi.mock("@/lib/security/client-ip", () => ({ clientIp: async () => "203.0.113.9" }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/email/recipient-locale", () => ({ recipientLocale: vi.fn(async () => "en") }));

import { getOrderByCode } from "@/lib/registration/access";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/service";
import { resendTicketLinkAction } from "../actions";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const issuedOrder = {
  orderCode: "3XKQ7",
  email: "attendee@example.com",
  status: "paid",
  approvalStatus: "not_required",
  userId: null,
  magicLinkToken: "M1RB.sig",
  eventMappingId: "em1",
  eventMapping: { titleEn: "Demo Expo", organizationId: "org1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(rateLimit).mockReturnValue({ allowed: true, remaining: 1, resetAt: 0 });
  process.env.APP_URL = "https://events.example";
});

describe("resendTicketLinkAction", () => {
  it("mails the signed magic-link to the address already on the order", async () => {
    mock(getOrderByCode).mockResolvedValue(issuedOrder);
    await resendTicketLinkAction("demo-expo", "3XKQ7");

    const [email, meta] = mock(sendEmail).mock.calls[0];
    expect(email.to).toBe("attendee@example.com");
    expect(email.text).toContain("https://events.example/en/t/M1RB.sig");
    expect(meta.templateType).toBe("ticket_link_resend");
  });

  it("scopes the lookup to the event slug (no cross-event order code reuse)", async () => {
    mock(getOrderByCode).mockResolvedValue(issuedOrder);
    await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(getOrderByCode).toHaveBeenCalledWith("3XKQ7", "demo-expo");
  });

  it("answers a guessed code exactly as it answers a real one (no oracle)", async () => {
    mock(getOrderByCode).mockResolvedValue(issuedOrder);
    const real = await resendTicketLinkAction("demo-expo", "3XKQ7");

    vi.clearAllMocks();
    mock(rateLimit).mockReturnValue({ allowed: true, remaining: 1, resetAt: 0 });
    mock(getOrderByCode).mockResolvedValue(null);
    const guessed = await resendTicketLinkAction("demo-expo", "ZZZZZ");

    expect(guessed).toEqual(real);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing for an order still awaiting approval — there is no ticket", async () => {
    mock(getOrderByCode).mockResolvedValue({
      ...issuedOrder,
      status: "pending",
      approvalStatus: "pending",
    });
    await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing for an unpaid COD order", async () => {
    mock(getOrderByCode).mockResolvedValue({ ...issuedOrder, status: "pending" });
    await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops at the IP limit without touching the database", async () => {
    mock(rateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 });
    const res = await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(res.message).toContain("Too many requests");
    expect(getOrderByCode).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("caps sends per order code so a known code cannot be used to mailbomb", async () => {
    // First gate (per IP) passes, second gate (per order) trips.
    mock(rateLimit)
      .mockReturnValueOnce({ allowed: true, remaining: 1, resetAt: 0 })
      .mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    mock(getOrderByCode).mockResolvedValue(issuedOrder);
    await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns the neutral message even when the mail transport throws", async () => {
    mock(getOrderByCode).mockResolvedValue(issuedOrder);
    mock(sendEmail).mockRejectedValue(new Error("smtp down"));
    const res = await resendTicketLinkAction("demo-expo", "3XKQ7");
    expect(res.message).toContain("we've emailed the link");
  });
});
