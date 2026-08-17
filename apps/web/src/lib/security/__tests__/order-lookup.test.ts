import { describe, it, expect, beforeEach, vi } from "vitest";

let forwardedFor: string | null = null;
let realIp: string | null = null;

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") return forwardedFor;
      if (name === "x-real-ip") return realIp;
      return null;
    },
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
  realIp = null;
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

  it("keys a proxied client by the proxy-appended hop, not the spoofable one", async () => {
    forwardedFor = "198.51.100.7, 10.0.0.1";
    for (let i = 0; i < ORDER_LOOKUP_LIMIT; i += 1) {
      await allowOrderCodeLookup("expo");
    }
    expect(await allowOrderCodeLookup("expo")).toBe(false);
    // Rotating the attacker-controlled LEFTMOST entry must not mint a fresh
    // budget. Reading it was the bypass that made order-code enumeration free.
    forwardedFor = "198.51.100.8, 10.0.0.1";
    expect(await allowOrderCodeLookup("expo")).toBe(false);
  });

  it("still separates genuine clients by the proxy-set x-real-ip", async () => {
    realIp = "198.51.100.7";
    for (let i = 0; i < ORDER_LOOKUP_LIMIT; i += 1) {
      await allowOrderCodeLookup("expo");
    }
    expect(await allowOrderCodeLookup("expo")).toBe(false);
    // x-real-ip is written by the adjacent proxy from the TCP peer and
    // overwrites anything the client sent, so it is safe to distinguish on.
    realIp = "198.51.100.8";
    expect(await allowOrderCodeLookup("expo")).toBe(true);
  });

  it("exhausting one event's budget does not lock the attendee out of another", async () => {
    for (let i = 0; i <= ORDER_LOOKUP_LIMIT; i += 1) {
      await allowOrderCodeLookup("expo");
    }
    expect(await allowOrderCodeLookup("gala")).toBe(true);
  });
});
