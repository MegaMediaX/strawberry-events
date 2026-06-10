import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    webhook: { create: vi.fn(), findUnique: vi.fn() },
    webhookDelivery: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/webhooks/ssrf-guard", () => ({
  assertSafeWebhookUrl: vi.fn().mockResolvedValue(undefined),
  SsrfViolationError: class SsrfViolationError extends Error {},
}));
vi.mock("@/lib/webhooks/service", () => ({ deliver: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import { assertSafeWebhookUrl, SsrfViolationError } from "@/lib/webhooks/ssrf-guard";
import { deliver } from "@/lib/webhooks/service";
import { createWebhook, testWebhook } from "@/lib/webhooks/admin-service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(assertSafeWebhookUrl).mockResolvedValue(undefined);
});

describe("createWebhook", () => {
  it("rejects an SSRF-flagged URL before creating the webhook", async () => {
    mock(assertSafeWebhookUrl).mockRejectedValueOnce(
      new SsrfViolationError("Webhook URL must use https"),
    );
    await expect(
      createWebhook(orgAdmin, {
        organizationId: "orgA",
        url: "http://10.0.0.1/hook",
        events: ["order.paid"],
      }),
    ).rejects.toBeInstanceOf(SsrfViolationError);
    expect(prisma.webhook.create).not.toHaveBeenCalled();
  });

  it("creates the webhook when the URL passes the guard", async () => {
    mock(prisma.webhook.create).mockResolvedValue({ id: "w1", organizationId: "orgA" });
    await createWebhook(orgAdmin, {
      organizationId: "orgA",
      url: "https://hooks.example.com/in",
      events: ["order.paid"],
    });
    expect(assertSafeWebhookUrl).toHaveBeenCalledWith("https://hooks.example.com/in");
    expect(prisma.webhook.create).toHaveBeenCalledTimes(1);
  });
});

describe("testWebhook", () => {
  it("delegates to deliver for an owned webhook", async () => {
    mock(prisma.webhook.findUnique).mockResolvedValue({
      id: "w1", organizationId: "orgA", url: "https://hooks.example.com/in", secret: "s",
    });
    mock(prisma.webhookDelivery.create).mockResolvedValue({ id: "d1" });
    const res = await testWebhook(orgAdmin, "w1");
    expect(res).toEqual({ ok: true });
    expect(deliver).toHaveBeenCalledTimes(1);
  });
});
