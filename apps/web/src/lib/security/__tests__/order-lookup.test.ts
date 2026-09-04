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

async function exhaust(scope: string) {
  for (let i = 0; i < ORDER_LOOKUP_LIMIT; i += 1) {
    await allowOrderCodeLookup(scope);
  }
}

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

  /**
   * The regression this file exists for.
   *
   * Every proxy in front of this app APPENDS the peer it saw, so the header is
   * "<whatever the client typed>, <real client>". Reading the leftmost entry —
   * which this module used to do — let an attacker mint a fresh rate-limit
   * bucket per request by rotating a value they control, disabling the limiter
   * completely. The budget must follow the proxy-appended entry instead.
   */
  it("ignores a spoofed leading x-forwarded-for entry", async () => {
    forwardedFor = "1.1.1.1, 203.0.113.9";
    await exhaust("expo");
    expect(await allowOrderCodeLookup("expo")).toBe(false);

    // Same real client, attacker rotates the part they control. Still blocked.
    forwardedFor = "9.9.9.9, 203.0.113.9";
    expect(await allowOrderCodeLookup("expo")).toBe(false);

    forwardedFor = "not-an-ip, 203.0.113.9";
    expect(await allowOrderCodeLookup("expo")).toBe(false);
  });

  it("still gives two genuinely different clients their own budget", async () => {
    forwardedFor = "10.0.0.1, 203.0.113.9";
    await exhaust("expo");
    expect(await allowOrderCodeLookup("expo")).toBe(false);

    // A different client behind the same proxy — different appended entry.
    forwardedFor = "10.0.0.1, 203.0.113.10";
    expect(await allowOrderCodeLookup("expo")).toBe(true);
  });

  it("prefers x-real-ip, which the adjacent proxy overwrites", async () => {
    realIp = "203.0.113.50";
    forwardedFor = "1.1.1.1, 203.0.113.9";
    await exhaust("expo");
    expect(await allowOrderCodeLookup("expo")).toBe(false);

    // Whole forwarded chain changes; the trustworthy header did not.
    forwardedFor = "2.2.2.2, 198.51.100.4";
    expect(await allowOrderCodeLookup("expo")).toBe(false);
  });

  it("exhausting one event's budget does not lock the attendee out of another", async () => {
    await exhaust("expo");
    expect(await allowOrderCodeLookup("expo")).toBe(false);
    expect(await allowOrderCodeLookup("gala")).toBe(true);
  });
});
