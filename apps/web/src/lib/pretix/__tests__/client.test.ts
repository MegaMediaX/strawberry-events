import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pretixFetch, pretixFetchAll, PretixError } from "@/lib/pretix/client";
import { PretixValidationError } from "@/lib/pretix/errors";
import { installFetchMock, jsonResponse, setPretixEnv } from "./helpers";

const originalEnv = { ...process.env };

describe("pretixFetch", () => {
  beforeEach(() => setPretixEnv());
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("sends the API token and resolves the base URL", async () => {
    const fetchMock = installFetchMock(jsonResponse({ ok: true }));
    const result = await pretixFetch<{ ok: boolean }>("/organizers/");
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pretix.example.com/api/v1/organizers/");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Token tok_123",
    );
  });

  it("uses an explicit token over the env token when provided", async () => {
    const fetchMock = installFetchMock(jsonResponse({ ok: true }));
    await pretixFetch("/organizers/", {}, "explicit_tok");
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Token explicit_tok",
    );
  });

  it("throws PretixError on non-2xx responses", async () => {
    installFetchMock(jsonResponse({ detail: "nope" }, 404));
    await expect(pretixFetch("/missing/")).rejects.toBeInstanceOf(PretixError);
  });

  it("throws PretixValidationError on 400 with field errors", async () => {
    installFetchMock(jsonResponse({ email: ["required"] }, 400));
    const err = await pretixFetch("/orders/").catch((e) => e);
    expect(err).toBeInstanceOf(PretixValidationError);
    expect((err as PretixValidationError).fieldErrors.email).toEqual([
      "required",
    ]);
  });

  it("throws when configuration is missing", async () => {
    delete process.env.PRETIX_API_TOKEN;
    await expect(pretixFetch("/organizers/")).rejects.toBeInstanceOf(
      PretixError,
    );
  });
});

describe("pretixFetchAll", () => {
  beforeEach(() => setPretixEnv());
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("follows pagination and concatenates results", async () => {
    const fetchMock = installFetchMock(
      jsonResponse({
        count: 3,
        next: "https://pretix.example.com/api/v1/events/?page=2",
        results: [{ id: 1 }, { id: 2 }],
      }),
      jsonResponse({ count: 3, next: null, results: [{ id: 3 }] }),
    );

    const all = await pretixFetchAll<{ id: number }>("/events/");
    expect(all).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // second call hits the absolute `next` URL with auth header
    const [url2, init2] = fetchMock.mock.calls[1];
    expect(url2).toBe("https://pretix.example.com/api/v1/events/?page=2");
    expect((init2?.headers as Record<string, string>).Authorization).toBe(
      "Token tok_123",
    );
  });
});
