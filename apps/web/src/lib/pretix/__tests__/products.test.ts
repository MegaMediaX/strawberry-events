import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listItems, createItem, updateItem, createQuota, listQuotas } from "@/lib/pretix/products";
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
    // rawItem has no description field → maps to nulls, not undefined/crash.
    expect(items[0].descriptionEn).toBeNull();
    expect(items[0].descriptionAr).toBeNull();
  });

  it("maps the item description i18n when present", async () => {
    installFetchMock(
      jsonResponse({
        count: 1,
        next: null,
        results: [
          {
            ...rawItem,
            description: { en: "Access to the expo floor", ar: "دخول إلى أرض المعرض" },
          },
        ],
      }),
    );
    const items = await listItems("strawberry", "expo");
    expect(items[0].descriptionEn).toBe("Access to the expo floor");
    expect(items[0].descriptionAr).toBe("دخول إلى أرض المعرض");
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
    // No description supplied → explicit null (pretix's empty value).
    expect(body.description).toBeNull();
  });

  it("POSTs the description i18n when provided", async () => {
    const spy = installFetchMock(jsonResponse(rawItem, 201));
    await createItem("strawberry", "expo", {
      titleEn: "Visitor",
      descriptionEn: "Access to the expo floor",
      descriptionAr: "دخول إلى أرض المعرض",
      priceCents: 2500,
    });
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.description).toEqual({
      en: "Access to the expo floor",
      ar: "دخول إلى أرض المعرض",
    });
  });
});

describe("updateItem", () => {
  it("PATCHes description when the caller manages it (empty → null clears)", async () => {
    const spy = installFetchMock(jsonResponse(rawItem));
    await updateItem("strawberry", "expo", 7, {
      titleEn: "Visitor",
      descriptionEn: null,
      descriptionAr: null,
      priceCents: 2500,
    });
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect("description" in body).toBe(true);
    expect(body.description).toBeNull();
  });

  it("omits description entirely for callers that do not manage it", async () => {
    const spy = installFetchMock(jsonResponse(rawItem));
    await updateItem("strawberry", "expo", 7, { titleEn: "Visitor", priceCents: 2500 });
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect("description" in body).toBe(false);
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
