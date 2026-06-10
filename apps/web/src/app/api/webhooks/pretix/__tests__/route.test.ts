import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pretix/webhooks", () => ({ verifyWebhook: vi.fn() }));
vi.mock("@/lib/pretix/handlers", () => ({ dispatch: vi.fn() }));

import { verifyWebhook } from "@/lib/pretix/webhooks";
import { dispatch } from "@/lib/pretix/handlers";
import { PretixError } from "@/lib/pretix/errors";
import { POST } from "@/app/api/webhooks/pretix/route";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const req = () => new Request("https://app/api/webhooks/pretix", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/pretix", () => {
  it("dispatches a verified event and returns 200", async () => {
    mock(verifyWebhook).mockResolvedValue({ action: "pretix.event.order.paid", organizer: "acme", event: "expo", code: "X" });
    mock(dispatch).mockResolvedValue(undefined);
    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("returns 401 and does not dispatch when verification fails", async () => {
    mock(verifyWebhook).mockRejectedValue(new PretixError("invalid webhook signature", 401));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns 500 when dispatch throws (so pretix retries)", async () => {
    mock(verifyWebhook).mockResolvedValue({ action: "pretix.event.order.paid", organizer: "acme", event: "expo", code: "X" });
    mock(dispatch).mockRejectedValue(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});
