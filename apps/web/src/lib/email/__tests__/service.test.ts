import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDevTransport, sendEmail } from "@/lib/email/service";
import {
  pendingEmail,
  confirmationEmail,
  pendingApprovalEmail,
  approvedPaymentEmail,
  rejectedEmail,
} from "@/lib/email/templates";

const orig = { ...process.env };
beforeEach(() => {
  delete process.env.SMTP_HOST;
});
afterEach(() => {
  process.env = { ...orig };
});

describe("email service", () => {
  it("uses the dev transport when SMTP is not configured", () => {
    expect(isDevTransport()).toBe(true);
  });

  it("send returns true and does not throw with dev transport", async () => {
    await expect(
      sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" }),
    ).resolves.toBe(true);
  });
});

describe("templates", () => {
  it("renders pending in en and ar", () => {
    expect(pendingEmail("en", "Expo", "ABC12").subject).toContain("Expo");
    expect(pendingEmail("ar", "Expo", "ABC12").text).toContain("ABC12");
  });
  it("renders confirmation with ticket url", () => {
    expect(
      confirmationEmail("en", "Expo", "ABC12", "https://x/t/abc").text,
    ).toContain("https://x/t/abc");
  });
  it("renders approval lifecycle templates (en + ar)", () => {
    expect(pendingApprovalEmail("en", "Expo", "A1").subject).toMatch(/review/i);
    expect(pendingApprovalEmail("ar", "Expo", "A1").text).toContain("A1");
    expect(approvedPaymentEmail("en", "Expo", "A1").subject).toMatch(/payment/i);
    expect(rejectedEmail("en", "Expo", "A1").subject).toMatch(/not approved/i);
  });
});
