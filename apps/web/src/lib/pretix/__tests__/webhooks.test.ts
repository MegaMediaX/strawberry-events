import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyWebhook } from "@/lib/pretix/webhooks";
import { PretixError } from "@/lib/pretix/errors";
import { safeEqual } from "@/lib/security/compare";

const orig = { ...process.env };
beforeEach(() => {
  process.env.PRETIX_WEBHOOK_SECRET = "a-strong-webhook-secret-value";
});
afterEach(() => {
  process.env = { ...orig };
});

function req(headerSecret: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (headerSecret !== null) headers["x-pretix-webhook-secret"] = headerSecret;
  return new Request("https://app/api/webhooks/pretix", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("verifyWebhook", () => {
  it("accepts a valid signature via header", async () => {
    const ev = await verifyWebhook(
      req("a-strong-webhook-secret-value", {
        action: "pretix.event.order.paid",
        organizer: "strawberry",
        event: "expo",
        code: "ABC12",
      }),
    );
    expect(ev).toMatchObject({ action: "pretix.event.order.paid", organizer: "strawberry" });
  });

  it("rejects a missing signature header", async () => {
    await expect(verifyWebhook(req(null, { action: "x", organizer: "o" }))).rejects.toBeInstanceOf(
      PretixError,
    );
  });

  it("rejects an invalid signature", async () => {
    await expect(
      verifyWebhook(req("wrong-secret", { action: "x", organizer: "o" })),
    ).rejects.toBeInstanceOf(PretixError);
  });

  it("does NOT accept the secret via query string", async () => {
    const r = new Request(
      "https://app/api/webhooks/pretix?secret=a-strong-webhook-secret-value",
      { method: "POST", body: JSON.stringify({ action: "x", organizer: "o" }), headers: { "content-type": "application/json" } },
    );
    await expect(verifyWebhook(r)).rejects.toBeInstanceOf(PretixError);
  });

  it("fails (503) when the secret is not configured", async () => {
    delete process.env.PRETIX_WEBHOOK_SECRET;
    await expect(verifyWebhook(req("anything", { action: "x", organizer: "o" }))).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe("safeEqual", () => {
  it("true for equal strings, false for unequal / different length", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
