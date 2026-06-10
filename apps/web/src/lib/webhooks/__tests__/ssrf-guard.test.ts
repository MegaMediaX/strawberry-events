import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns/promises";
import {
  assertSafeWebhookUrl,
  isPrivateIPv4,
  SsrfViolationError,
} from "@/lib/webhooks/ssrf-guard";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: resolve to a public address so static-pass URLs succeed.
  mock(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

describe("isPrivateIPv4", () => {
  it.each([
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.15.0.0", false],
    ["172.32.0.0", false],
    ["192.168.0.1", true],
    ["169.254.169.254", true],
    ["127.0.0.1", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
  ])("classifies %s as private=%s", (addr, expected) => {
    expect(isPrivateIPv4(addr)).toBe(expected);
  });
});

describe("assertSafeWebhookUrl — static rejections", () => {
  it.each([
    "not a url",
    "http://example.com/hook",
    "ftp://example.com",
    "https://localhost/hook",
    "https://[::1]/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.1/hook",
    "https://10.0.0.1/hook",
    "https://172.16.0.5/hook",
    "https://intranet.internal/hook",
  ])("rejects %s", async (url) => {
    await expect(assertSafeWebhookUrl(url)).rejects.toBeInstanceOf(SsrfViolationError);
  });

  it("does not perform a DNS lookup for a statically-blocked host", async () => {
    await expect(assertSafeWebhookUrl("https://10.0.0.1/hook")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("assertSafeWebhookUrl — DNS resolution", () => {
  it("allows a public https URL that resolves to a public address", async () => {
    mock(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeWebhookUrl("https://example.com/hook")).resolves.toBeUndefined();
  });

  it("rejects a public hostname that resolves to a private address (rebind)", async () => {
    mock(lookup).mockResolvedValue([{ address: "192.168.1.100", family: 4 }]);
    await expect(
      assertSafeWebhookUrl("https://evil.example.com/hook"),
    ).rejects.toBeInstanceOf(SsrfViolationError);
  });
});
