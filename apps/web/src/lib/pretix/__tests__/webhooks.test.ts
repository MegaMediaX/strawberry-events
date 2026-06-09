import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyWebhook } from "@/lib/pretix/webhooks";
import { PretixError } from "@/lib/pretix/errors";

const orig = { ...process.env };
beforeEach(() => {
  process.env.PRETIX_WEBHOOK_SECRET = "whsec";
});
afterEach(() => {
  process.env = { ...orig };
});

function req(secret: string | null, body: unknown): Request {
  const url = secret
    ? `https://app/api/webhooks/pretix?secret=${secret}`
    : "https://app/api/webhooks/pretix";
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("verifyWebhook", () => {
  it("parses a valid event when the secret matches", async () => {
    const ev = await verifyWebhook(
      req("whsec", {
        action: "pretix.event.order.paid",
        organizer: "strawberry",
        event: "expo",
        code: "ABC12",
      }),
    );
    expect(ev).toMatchObject({
      action: "pretix.event.order.paid",
      organizer: "strawberry",
      event: "expo",
      code: "ABC12",
    });
  });

  it("rejects a missing/wrong secret", async () => {
    await expect(verifyWebhook(req("nope", { action: "x", organizer: "o" }))).rejects.toBeInstanceOf(
      PretixError,
    );
    await expect(verifyWebhook(req(null, { action: "x", organizer: "o" }))).rejects.toBeInstanceOf(
      PretixError,
    );
  });
});
