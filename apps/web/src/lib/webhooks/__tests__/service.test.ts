import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    webhook: { findMany: vi.fn() },
    webhookDelivery: { create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
}));

import { prisma } from "@/lib/db/client";
import { signPayload, deliver, emit } from "@/lib/webhooks/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("signPayload", () => {
  it("matches an independent HMAC-SHA256 of timestamp.body", () => {
    const sig = signPayload("shh", "1700000000", '{"a":1}');
    const expected = createHmac("sha256", "shh").update("1700000000.{\"a\":1}").digest("hex");
    expect(sig).toBe(expected);
  });
});

describe("deliver", () => {
  it("signs the request and records success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const okRes = await deliver({
      id: "d1", event: "order.paid", payload: { x: 1 }, attempts: 0,
      webhook: { url: "https://hook", secret: "s" },
    });
    expect(okRes).toBe(true);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Strawberry-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["X-Strawberry-Event"]).toBe("order.paid");
    expect(mock(prisma.webhookDelivery.update).mock.calls[0][0].data.success).toBe(true);
  });

  it("records failure without throwing when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const res = await deliver({
      id: "d2", event: "order.paid", payload: {}, attempts: 0,
      webhook: { url: "https://hook", secret: "s" },
    });
    expect(res).toBe(false);
    expect(mock(prisma.webhookDelivery.update).mock.calls[0][0].data.error).toMatch(/network/i);
  });
});

describe("emit", () => {
  it("creates a delivery per subscribed webhook and never throws", async () => {
    mock(prisma.webhook.findMany).mockResolvedValue([
      { id: "w1", url: "https://h", secret: "s", events: ["order.paid"] },
    ]);
    mock(prisma.webhookDelivery.create).mockResolvedValue({ id: "d1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    await expect(emit("orgA", "order.paid", { orderCode: "X" })).resolves.toBeUndefined();
    expect(prisma.webhookDelivery.create).toHaveBeenCalled();
  });

  it("swallows errors (never breaks the caller)", async () => {
    mock(prisma.webhook.findMany).mockRejectedValue(new Error("db down"));
    await expect(emit("orgA", "order.paid", {})).resolves.toBeUndefined();
  });
});
