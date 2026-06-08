import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOrder,
  getOrder,
  markOrderPaid,
  cancelOrder,
} from "@/lib/pretix/orders";
import { installFetchMock, jsonResponse, setPretixEnv } from "./helpers";

const originalEnv = { ...process.env };
beforeEach(() => setPretixEnv());
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const rawOrder = { code: "ABC12", status: "n", email: "a@b.com", total: "25.00" };

describe("createOrder", () => {
  it("POSTs a pending/unpaid order", async () => {
    const spy = installFetchMock(jsonResponse(rawOrder, 201));
    const order = await createOrder("strawberry", "expo", {
      email: "a@b.com",
      positions: [{ item: 7 }],
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/orders/",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    // COD: order is created pending, no payment captured.
    expect(body.status).toBe("n");
    expect(order).toMatchObject({ code: "ABC12", status: "n" });
  });
});

describe("getOrder", () => {
  it("GETs an order by code", async () => {
    const spy = installFetchMock(jsonResponse(rawOrder));
    await getOrder("strawberry", "expo", "ABC12");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/orders/ABC12/",
    );
  });
});

describe("markOrderPaid", () => {
  it("POSTs mark_paid", async () => {
    const spy = installFetchMock(jsonResponse({ ...rawOrder, status: "p" }));
    const order = await markOrderPaid("strawberry", "expo", "ABC12");
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/orders/ABC12/mark_paid/",
    );
    expect(init?.method).toBe("POST");
    expect(order.status).toBe("p");
  });
});

describe("cancelOrder", () => {
  it("POSTs cancel", async () => {
    const spy = installFetchMock(jsonResponse({}, 200));
    await cancelOrder("strawberry", "expo", "ABC12");
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/orders/ABC12/cancel/",
    );
    expect(init?.method).toBe("POST");
  });
});
