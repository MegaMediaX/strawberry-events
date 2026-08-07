import { describe, it, expect, afterEach, vi } from "vitest";

// next/headers only works inside a request scope; the rest of the suite mocks it
// the same way so the module can be imported in a plain node test environment.
// vi.hoisted keeps the shared map initialized before the hoisted vi.mock factory.
const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => requestHeaders[name.toLowerCase()] ?? null }),
}));

import { resolveClientIp, clientIp } from "@/lib/security/client-ip";

/** Build a case-insensitive header getter from a plain lowercase-keyed object. */
function headerGetter(h: Record<string, string>) {
  return (name: string) => h[name.toLowerCase()] ?? null;
}

const ORIGINAL_HOPS = process.env.TRUSTED_PROXY_HOPS;

afterEach(() => {
  if (ORIGINAL_HOPS === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = ORIGINAL_HOPS;
  for (const k of Object.keys(requestHeaders)) delete requestHeaders[k];
});

describe("resolveClientIp", () => {
  it("ignores an attacker-spoofed leftmost X-Forwarded-For entry", () => {
    // Traefik appends the real peer, so everything left of the last entry is
    // whatever the attacker typed. Reading it would let them rotate the value
    // per request and reset every rate-limit bucket.
    const get = headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(resolveClientIp(get)).toBe("203.0.113.9");
  });

  it("does not let a spoofed leftmost entry produce distinct keys", () => {
    const a = resolveClientIp(headerGetter({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }));
    const b = resolveClientIp(headerGetter({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" }));
    expect(a).toBe(b);
  });

  it("takes the rightmost entry of a multi-hop chain by default", () => {
    const get = headerGetter({ "x-forwarded-for": "6.6.6.6, 198.51.100.4, 203.0.113.9" });
    expect(resolveClientIp(get)).toBe("203.0.113.9");
  });

  it("walks back one extra entry per configured trusted proxy hop", () => {
    // Traefik -> nginx -> app: [spoof, realClient, traefik].
    const get = headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" });
    expect(resolveClientIp(get, 2)).toBe("203.0.113.9");
  });

  it("clamps to the leftmost entry when the chain is shorter than configured", () => {
    const get = headerGetter({ "x-forwarded-for": "203.0.113.9" });
    expect(resolveClientIp(get, 3)).toBe("203.0.113.9");
  });

  it("prefers x-real-ip over X-Forwarded-For", () => {
    const get = headerGetter({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
      "x-real-ip": "198.51.100.7",
    });
    expect(resolveClientIp(get)).toBe("198.51.100.7");
  });

  it("ignores x-real-ip with multiple hops (inner proxy overwrites it)", () => {
    // With stacked proxies x-real-ip holds the ADJACENT proxy, so trusting it
    // would collapse every visitor into one shared bucket.
    const get = headerGetter({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2",
      "x-real-ip": "10.0.0.2",
    });
    expect(resolveClientIp(get, 2)).toBe("203.0.113.9");
  });

  it("falls back to X-Forwarded-For when x-real-ip is absent or unusable", () => {
    expect(resolveClientIp(headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    const junk = headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "  " });
    expect(resolveClientIp(junk)).toBe("203.0.113.9");
  });

  it("returns the shared unknown bucket when no usable header is present", () => {
    expect(resolveClientIp(headerGetter({}))).toBe("unknown");
    expect(resolveClientIp(headerGetter({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(resolveClientIp(headerGetter({ "x-forwarded-for": " , " }))).toBe("unknown");
  });

  it("rejects entries that are not plausibly addresses instead of keying on them", () => {
    // Junk must not become a long-lived rate-limit Map key.
    const get = headerGetter({ "x-forwarded-for": "1.2.3.4, not-an-ip" });
    expect(resolveClientIp(get)).toBe("unknown");
    expect(resolveClientIp(headerGetter({ "x-forwarded-for": `1.2.3.4, ${"9".repeat(200)}` }))).toBe(
      "unknown",
    );
  });

  it("normalizes ports, IPv6 brackets, and case so one client keeps one bucket", () => {
    expect(resolveClientIp(headerGetter({ "x-real-ip": "203.0.113.9:51234" }))).toBe("203.0.113.9");
    expect(resolveClientIp(headerGetter({ "x-real-ip": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
    expect(resolveClientIp(headerGetter({ "x-real-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
  });

  it("reads TRUSTED_PROXY_HOPS from the environment", () => {
    const get = headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" });
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(resolveClientIp(get)).toBe("203.0.113.9");
  });

  it("falls back to the safe single-hop default on a bogus TRUSTED_PROXY_HOPS", () => {
    const get = headerGetter({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    for (const bogus of ["0", "-1", "abc", ""]) {
      process.env.TRUSTED_PROXY_HOPS = bogus;
      expect(resolveClientIp(get)).toBe("203.0.113.9");
    }
  });
});

describe("clientIp", () => {
  it("resolves from the live request headers", async () => {
    requestHeaders["x-forwarded-for"] = "6.6.6.6, 203.0.113.9";
    expect(await clientIp()).toBe("203.0.113.9");
  });

  it("returns the shared unknown bucket with no forwarding headers", async () => {
    expect(await clientIp()).toBe("unknown");
  });
});
