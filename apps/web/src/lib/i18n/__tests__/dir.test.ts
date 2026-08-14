import { describe, it, expect } from "vitest";
import { dirForLocale, locales, defaultLocale } from "@/lib/i18n/dir";

describe("dirForLocale", () => {
  // "ar" is no longer a served locale, but dirForLocale still classifies it
  // correctly so the mapping is intact if Arabic is ever restored.
  it("ar is still classified rtl even though it is not served", () => {
    expect(dirForLocale("ar")).toBe("rtl");
  });

  it("en is ltr", () => {
    expect(dirForLocale("en")).toBe("ltr");
  });

  it("unknown locale falls back to ltr", () => {
    expect(dirForLocale("fr")).toBe("ltr");
  });

  it("exposes the supported locales and default", () => {
    expect(locales).toEqual(["en"]);
    expect(defaultLocale).toBe("en");
  });
});
