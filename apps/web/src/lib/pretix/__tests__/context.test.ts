import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt } from "@/lib/crypto";
import { resolvePretixContext } from "@/lib/pretix/context";

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env = { ...originalEnv, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY };
  vi.restoreAllMocks();
});

describe("resolvePretixContext", () => {
  it("uses the org's decrypted token when set", () => {
    const org = {
      pretixOrganizerSlug: "acme",
      pretixApiToken: encrypt("org_tok"),
    };
    expect(resolvePretixContext(org)).toEqual({
      organizerSlug: "acme",
      token: "org_tok",
    });
  });

  it("falls back to the env token when org token is null", () => {
    process.env.PRETIX_API_TOKEN = "env_tok";
    const org = { pretixOrganizerSlug: "acme", pretixApiToken: null };
    expect(resolvePretixContext(org)).toEqual({
      organizerSlug: "acme",
      token: "env_tok",
    });
  });
});
