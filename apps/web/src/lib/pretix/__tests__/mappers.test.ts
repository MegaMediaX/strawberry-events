import { describe, it, expect } from "vitest";
import { toI18n, fromI18n, priceToCents, centsToPrice } from "@/lib/pretix/mappers";

describe("fromI18n", () => {
  it("picks en and ar", () => {
    expect(fromI18n({ en: "Hi", ar: "مرحبا" })).toEqual({
      titleEn: "Hi",
      titleAr: "مرحبا",
    });
  });

  it("handles missing ar", () => {
    expect(fromI18n({ en: "Hi" })).toEqual({ titleEn: "Hi", titleAr: null });
  });

  it("falls back to any value when en absent", () => {
    expect(fromI18n({ de: "Hallo" }).titleEn).toBe("Hallo");
  });
});

describe("toI18n", () => {
  it("drops empty ar", () => {
    expect(toI18n("Hi", null)).toEqual({ en: "Hi" });
    expect(toI18n("Hi", "")).toEqual({ en: "Hi" });
  });

  it("includes ar when present", () => {
    expect(toI18n("Hi", "مرحبا")).toEqual({ en: "Hi", ar: "مرحبا" });
  });
});

describe("money", () => {
  it("price string to cents", () => {
    expect(priceToCents("10.50")).toBe(1050);
    expect(priceToCents("0.00")).toBe(0);
    expect(priceToCents("100")).toBe(10000);
  });

  it("cents to price string with 2 decimals", () => {
    expect(centsToPrice(1050)).toBe("10.50");
    expect(centsToPrice(0)).toBe("0.00");
    expect(centsToPrice(5)).toBe("0.05");
  });
});
