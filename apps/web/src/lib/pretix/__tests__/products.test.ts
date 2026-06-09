import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listItems, createItem, createQuota, listQuotas } from "@/lib/pretix/products";
import { installFetchMock, jsonResponse, setPretixEnv } from "./helpers";

const originalEnv = { ...process.env };
beforeEach(() => setPretixEnv());
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const rawItem = {
  id: 7,
  name: { en: "Visitor", ar: "زائر" },
  default_price: "25.00",
  active: true,
};

describe("listItems", () => {
  it("GETs the items list (paginated) and maps", async () => {
    const spy = installFetchMock(
      jsonResponse({ count: 1, next: null, results: [rawItem] }),
    );
    const items = await listItems("strawberry", "expo");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/items/",
    );
    expect(items[0]).toMatchObject({
      id: 7,
      titleEn: "Visitor",
      priceCents: 2500,
      active: true,
    });
  });
});

describe("createItem", () => {
  it("POSTs name i18n and default_price from cents", async () => {
    const spy = installFetchMock(jsonResponse(rawItem, 201));
    await createItem("strawberry", "expo", {
      titleEn: "Visitor",
      titleAr: "زائر",
      priceCents: 2500,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/items/",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.name).toEqual({ en: "Visitor", ar: "زائر" });
    expect(body.default_price).toBe("25.00");
  });
});

describe("createQuota", () => {
  it("POSTs a quota for the given items", async () => {
    const spy = installFetchMock(
      jsonResponse({ id: 1, name: "Q", size: 100, items: [7] }, 201),
    );
    await createQuota("strawberry", "expo", {
      name: "Q",
      size: 100,
      items: [7],
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/quotas/",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Q",
      size: 100,
      items: [7],
    });
  });
});

describe("listQuotas", () => {
  it("GETs quotas with availability", async () => {
    const spy = installFetchMock(
      jsonResponse({
        count: 1,
        next: null,
        results: [{ id: 1, size: 100, available_number: 80 }],
      }),
    );
    const quotas = await listQuotas("strawberry", "expo");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/quotas/?with_availability=true",
    );
    expect(quotas[0].available_number).toBe(80);
  });
});
