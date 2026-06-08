import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listEvents, getEvent, createEvent, updateEvent } from "@/lib/pretix/events";
import { installFetchMock, jsonResponse, setPretixEnv } from "./helpers";

const originalEnv = { ...process.env };

beforeEach(() => setPretixEnv());
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const sampleEvent = {
  slug: "expo",
  name: { en: "Expo", ar: "إكسبو" },
  live: true,
  date_from: "2026-09-01T09:00:00Z",
  date_to: null,
};

describe("listEvents", () => {
  it("GETs the org events list and maps names", async () => {
    const spy = installFetchMock(
      jsonResponse({ count: 1, next: null, results: [sampleEvent] }),
    );
    const events = await listEvents("strawberry");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/",
    );
    expect(events[0]).toMatchObject({ slug: "expo", titleEn: "Expo", titleAr: "إكسبو" });
  });
});

describe("getEvent", () => {
  it("GETs a single event", async () => {
    const spy = installFetchMock(jsonResponse(sampleEvent));
    const ev = await getEvent("strawberry", "expo");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/",
    );
    expect(ev.titleEn).toBe("Expo");
  });
});

describe("createEvent", () => {
  it("POSTs with i18n name and slug", async () => {
    const spy = installFetchMock(jsonResponse(sampleEvent, 201));
    await createEvent("strawberry", {
      slug: "expo",
      titleEn: "Expo",
      titleAr: "إكسبو",
      live: false,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.name).toEqual({ en: "Expo", ar: "إكسبو" });
    expect(body.slug).toBe("expo");
  });
});

describe("updateEvent", () => {
  it("PATCHes the event", async () => {
    const spy = installFetchMock(jsonResponse({ ...sampleEvent, live: false }));
    await updateEvent("strawberry", "expo", { live: false });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/",
    );
    expect(init?.method).toBe("PATCH");
  });
});
