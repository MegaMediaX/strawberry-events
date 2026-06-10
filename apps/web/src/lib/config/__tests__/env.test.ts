import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/config/env";

const STRONG = "x".repeat(40);
const KEY32 = Buffer.alloc(32, 7).toString("base64");

function goodProd(): Record<string, string> {
  return {
    AUTH_SECRET: STRONG,
    MAGIC_LINK_SECRET: STRONG + "m",
    PRETIX_WEBHOOK_SECRET: STRONG + "w",
    ENCRYPTION_KEY: KEY32,
    DATABASE_URL: "postgresql://app:strongpw@db:5432/strawberry",
    PRETIX_BASE_URL: "https://pretix.example.com",
    PRETIX_API_TOKEN: "a-real-looking-pretix-token-1234567890",
    APP_URL: "https://events.example.com",
    SMTP_HOST: "smtp.example.com",
  };
}

describe("validateEnv", () => {
  it("development passes with documented dev values", () => {
    const dev = {
      AUTH_SECRET: "dev-only-secret-change-me",
      ENCRYPTION_KEY: "dev",
      DATABASE_URL: "postgresql://app:password@localhost:5433/strawberry_platform",
    };
    expect(validateEnv(dev, "development")).toEqual([]);
    expect(validateEnv(dev, undefined)).toEqual([]);
    expect(validateEnv(dev, "test")).toEqual([]);
  });

  it("a fully-configured production env passes", () => {
    expect(validateEnv(goodProd(), "production")).toEqual([]);
  });

  it("fails when AUTH_SECRET is missing", () => {
    const env = goodProd();
    delete env.AUTH_SECRET;
    const errs = validateEnv(env, "production");
    expect(errs.some((e) => e.includes("AUTH_SECRET"))).toBe(true);
  });

  it("fails when AUTH_SECRET is a change_me placeholder", () => {
    const env = { ...goodProd(), AUTH_SECRET: "change_me" };
    expect(validateEnv(env, "production").some((e) => e.includes("AUTH_SECRET"))).toBe(true);
  });

  it("rejects dev-secret / secret / password / empty placeholders", () => {
    for (const weak of ["dev-secret", "secret", "password", ""]) {
      const env = { ...goodProd(), MAGIC_LINK_SECRET: weak };
      expect(validateEnv(env, "production").some((e) => e.includes("MAGIC_LINK_SECRET"))).toBe(true);
    }
  });

  it("fails when MAGIC_LINK_SECRET is missing", () => {
    const env = goodProd();
    delete env.MAGIC_LINK_SECRET;
    expect(validateEnv(env, "production").some((e) => e.includes("MAGIC_LINK_SECRET"))).toBe(true);
  });

  it("fails when ENCRYPTION_KEY is missing or not 32 bytes", () => {
    const missing = goodProd();
    delete missing.ENCRYPTION_KEY;
    expect(validateEnv(missing, "production").some((e) => e.includes("ENCRYPTION_KEY"))).toBe(true);
    const short = { ...goodProd(), ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") };
    expect(validateEnv(short, "production").some((e) => e.includes("ENCRYPTION_KEY"))).toBe(true);
  });

  it("requires HTTPS APP_URL in production", () => {
    const env = { ...goodProd(), APP_URL: "http://events.example.com" };
    expect(validateEnv(env, "production").some((e) => e.includes("APP_URL"))).toBe(true);
  });

  it("requires SMTP_HOST unless email is explicitly disabled", () => {
    const env = goodProd();
    delete env.SMTP_HOST;
    expect(validateEnv(env, "production").some((e) => e.includes("SMTP_HOST"))).toBe(true);
    const disabled = { ...env, ALLOW_EMAIL_DISABLED_IN_PRODUCTION: "true" };
    expect(validateEnv(disabled, "production").some((e) => e.includes("SMTP_HOST"))).toBe(false);
  });

  it("never includes the secret VALUE in error messages", () => {
    const env = { ...goodProd(), AUTH_SECRET: "change_me", PRETIX_API_TOKEN: "change_me" };
    const joined = validateEnv(env, "production").join(" | ");
    // messages name the variable but must not echo the offending value
    expect(joined).toContain("AUTH_SECRET");
    expect(joined).not.toContain("change_me");
  });
});
