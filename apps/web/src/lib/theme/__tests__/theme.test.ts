import { describe, it, expect } from "vitest";
import { resolveTheme } from "@/lib/theme/theme";

describe("resolveTheme", () => {
  it("returns explicit light/dark unchanged", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("system follows the prefers-dark signal", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("defaults to light when undefined", () => {
    expect(resolveTheme(undefined, false)).toBe("light");
  });
});
