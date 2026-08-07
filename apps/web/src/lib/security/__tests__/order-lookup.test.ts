import { describe, it, expect, beforeEach, vi } from "vitest";

let forwardedFor: string | null = null;

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? forwardedFor : null),
  }),
}));

import { __resetRateLimits } from "@/lib/security/rate-limit";
import {
  allowOrderCodeLookup,
  orderLookupKey,
  ORDER_LOOKUP_LIMIT,
} from "@/lib/security/order-lookup";

beforeEach(() => {
  __resetRateLimits();
  forwardedFor = "203.0.113.9";
});

describe("orderLookupKey", () => {
  it("namespaces by event so one event cannot exhaust another's budget", () => {
    expect(orderLookupKey("expo", "1.2.3.4")).not.toBe(orderLookupKey("gala", "1.2.3.4"));
  });
});

describe("allowOrderCodeLookup", () => {
  it("allows a normal burst of reloads then blocks the enumeration run", async () => {
    for (let i = 0; i < ORDER_LOOKUP_LIMIT; i += 1) {
      expect(await allowOrderCodeLookup("expo")).toBe(true);
    }
    expect(await allowOrderCodeLookup("expo")).toBe(false);
  });

  it("counts a proxied client by its first x-forwarded-for hop", async () => {
    forwardedFor = "198.51.100.7, 10.0.0.1";
    for (let i = 0; i < ORDER_LOOKUP_LIMIT; i += 1) {
      await allowOrderCodeLookup("expo");
    }
    expect(await allowOrderCodeLookup("expo")).toBe(false);
    // A different client behind the same proxy still gets its own budget.
    forwardedFor = "198.51.100.8, 10.0.0.1";
    expect(await allowOrderCodeLookup("expo")).toBe(true);
  });

  it("exhausting one event's budget does not lock the attendee out of another", async () => {
    for (let i = 0; i <= ORDER_LOOKUP_LIMIT; i += 1) {
      await allowOrderCodeLookup("expo");
    }
    expect(await allowOrderCodeLookup("gala")).toBe(true);
  });
});
