import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pretixFetch, PretixError } from "@/lib/pretix/client";

const originalEnv = { ...process.env };

describe("pretixFetch", () => {
  beforeEach(() => {
    process.env.PRETIX_BASE_URL = "https://pretix.example.com";
    process.env.PRETIX_API_TOKEN = "tok_123";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("sends the API token and resolves the base URL", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const result = await pretixFetch<{ ok: boolean }>("/organizers/");

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pretix.example.com/api/v1/organizers/");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Token tok_123",
    );
  });

  it("throws PretixError on non-2xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope" }), { status: 404 }),
    );

    await expect(pretixFetch("/missing/")).rejects.toBeInstanceOf(PretixError);
  });

  it("throws when configuration is missing", async () => {
    delete process.env.PRETIX_API_TOKEN;
    await expect(pretixFetch("/organizers/")).rejects.toBeInstanceOf(
      PretixError,
    );
  });
});
