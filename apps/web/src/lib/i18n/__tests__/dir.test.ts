import { describe, it, expect } from "vitest";
import { dirForLocale, locales, defaultLocale } from "@/lib/i18n/dir";

describe("dirForLocale", () => {
  it("ar is rtl", () => {
    expect(dirForLocale("ar")).toBe("rtl");
  });

  it("en is ltr", () => {
    expect(dirForLocale("en")).toBe("ltr");
  });

  it("unknown locale falls back to ltr", () => {
    expect(dirForLocale("fr")).toBe("ltr");
  });

  it("exposes the supported locales and default", () => {
    expect(locales).toEqual(["en", "ar"]);
    expect(defaultLocale).toBe("en");
  });
});
