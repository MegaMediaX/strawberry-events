import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

vi.mock("@/lib/db/client", () => ({
  prisma: {
    smtpSetting: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    integrationSetting: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { encryptField, decryptField, redactConfig } from "@/lib/integrations/secrets";
import { saveSmtp, getSmtp } from "@/lib/integrations/smtp-service";
import { saveIntegration } from "@/lib/integrations/integration-service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u3", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
};

beforeEach(() => vi.clearAllMocks());

describe("secrets", () => {
  it("encrypt/decrypt round-trips and ciphertext != plaintext", () => {
    const enc = encryptField("hunter2");
    expect(enc).not.toContain("hunter2");
    expect(decryptField(enc)).toBe("hunter2");
  });
  it("redactConfig hides secrets and adds Configured flags", () => {
    const r = redactConfig({ apiKey: "enc", senderId: "X" }, ["apiKey"]);
    expect(r.apiKey).toBeUndefined();
    expect(r.apiKeyConfigured).toBe(true);
    expect(r.senderId).toBe("X");
  });
});

describe("saveSmtp", () => {
  beforeEach(() => {
    mock(prisma.smtpSetting.upsert).mockResolvedValue({ id: "s1" });
    mock(prisma.smtpSetting.findUnique).mockResolvedValue({
      id: "s1", host: "h", port: 587, username: "u", passwordEnc: "ENC", fromName: "F",
      fromEmail: "f@x", replyTo: null, encryption: "tls", lastTestedAt: null, lastError: null,
    });
  });

  it("encrypts password (no plaintext stored) and view hides it", async () => {
    const view = await saveSmtp(orgAdmin, "orgA", {
      host: "h", port: 587, fromName: "F", fromEmail: "f@x", encryption: "tls", password: "secretpw",
    });
    const stored = mock(prisma.smtpSetting.upsert).mock.calls[0][0].create;
    expect(stored.passwordEnc).toBeDefined();
    expect(stored.passwordEnc).not.toBe("secretpw");
    expect(decryptField(stored.passwordEnc)).toBe("secretpw");
    expect(view).not.toHaveProperty("password");
    expect(view?.passwordConfigured).toBe(true);
  });

  it("finance / checkin / impersonating cannot save; cross-org denied", async () => {
    await expect(saveSmtp(finance, "orgA", anySmtp())).rejects.toThrow();
    await expect(saveSmtp(staff, "orgA", anySmtp())).rejects.toThrow();
    await expect(saveSmtp({ ...orgAdmin, impersonating: true }, "orgA", anySmtp())).rejects.toThrow();
    await expect(saveSmtp(orgAdmin, "orgB", anySmtp())).rejects.toThrow();
  });
});

describe("saveIntegration", () => {
  it("encrypts secret fields", async () => {
    mock(prisma.integrationSetting.findUnique).mockResolvedValue(null);
    mock(prisma.integrationSetting.upsert).mockResolvedValue({ id: "i1" });
    await saveIntegration(orgAdmin, "orgA", "whatsapp", {
      enabled: true, config: { apiBaseUrl: "https://w" }, secrets: { accessToken: "tok123" },
    });
    const cfg = mock(prisma.integrationSetting.upsert).mock.calls[0][0].create.config;
    expect(cfg.apiBaseUrl).toBe("https://w");
    expect(cfg.accessToken).not.toBe("tok123");
    expect(decryptField(cfg.accessToken)).toBe("tok123");
  });

  it("finance cannot save integration", async () => {
    await expect(
      saveIntegration(finance, "orgA", "sms", { enabled: true, config: {} }),
    ).rejects.toThrow();
  });
});

function anySmtp() {
  return { host: "h", port: 587, fromName: "F", fromEmail: "f@x", encryption: "tls" as const };
}
void getSmtp;
