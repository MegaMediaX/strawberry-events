import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: { emailLog: { create: vi.fn() } } }));

import { prisma } from "@/lib/db/client";
import { isDevTransport, sendEmail, emailMode } from "@/lib/email/service";
import {
  pendingEmail,
  confirmationEmail,
  pendingApprovalEmail,
  approvedPaymentEmail,
  rejectedEmail,
} from "@/lib/email/templates";

const orig = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SMTP_HOST;
});
afterEach(() => {
  vi.unstubAllEnvs();
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

  it("dev-log mode only outside production", () => {
    expect(emailMode()).toBe("dev-log");
  });

  it("production with SMTP configured uses smtp mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    expect(emailMode()).toBe("smtp");
  });

  it("production without SMTP is 'disabled' and does NOT report a false success", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SMTP_HOST;
    expect(emailMode()).toBe("disabled");
    await expect(
      sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" }),
    ).resolves.toBe(false);
  });
});

describe("email logging (meta provided)", () => {
  const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
  const meta = { templateType: "ticket_issued", organizationId: "orgA", attendeeRef: "ABC12" };

  it("records a 'sent' log via dev-log provider when sending succeeds", async () => {
    await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" }, meta);
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(1);
    const data = mock(prisma.emailLog.create).mock.calls[0][0].data;
    expect(data).toMatchObject({ recipient: "a@b.com", status: "sent", provider: "dev_log", templateType: "ticket_issued", organizationId: "orgA" });
  });

  it("records a 'disabled' log in production with no SMTP (no false success)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SMTP_HOST;
    const ok = await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" }, meta);
    expect(ok).toBe(false);
    const data = mock(prisma.emailLog.create).mock.calls[0][0].data;
    expect(data.status).toBe("disabled");
  });

  it("does NOT log when no meta is provided (backward-compatible)", async () => {
    await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" });
    expect(prisma.emailLog.create).not.toHaveBeenCalled();
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
