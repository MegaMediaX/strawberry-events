// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_COOKIE,
  resolveTheme,
  themeFromCookie,
} from "@/lib/theme/theme";
import { buildSecurityHeaders } from "@/lib/security/headers";

/** A matchMedia whose answer the test controls and can change later. */
function fakeOs(prefersDark: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return {
    switchTo(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((fn) => fn());
    },
  };
}

function setCookie(value: string | null) {
  document.cookie =
    value === null ? `${THEME_COOKIE}=; max-age=0; path=/` : `${THEME_COOKIE}=${value}; path=/`;
}

const run = () => (0, eval)(THEME_INIT_SCRIPT);
const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  setCookie(null);
  document.documentElement.className = "";
});
afterEach(() => setCookie(null));

describe("THEME_INIT_SCRIPT", () => {
  /*
   * The script is resolveTheme() run in the browser. The two are written
   * separately — one is a string that must run before any bundle loads — so
   * this pins them to the same answer on every input rather than trusting
   * them to agree.
   */
  const cookies: Array<string | null> = [null, "dark", "light", "system", "garbage"];
  for (const cookie of cookies) {
    for (const prefersDark of [true, false]) {
      it(`agrees with resolveTheme: cookie=${cookie ?? "none"}, OS ${prefersDark ? "dark" : "light"}`, () => {
        setCookie(cookie);
        fakeOs(prefersDark);
        run();
        const expected = resolveTheme(themeFromCookie(cookie ?? undefined), prefersDark);
        expect(isDark()).toBe(expected === "dark");
      });
    }
  }

  it("serves a dark OS dark on a first visit — the bug", () => {
    // No cookie: the case the layout's `cookie === "dark"` got wrong.
    fakeOs(true);
    run();
    expect(isDark()).toBe(true);
  });

  it("follows the OS when it changes and nothing was chosen", () => {
    const os = fakeOs(false);
    run();
    expect(isDark()).toBe(false);
    os.switchTo(true);
    expect(isDark()).toBe(true);
  });

  it("lets a choice made AFTER load outrank a later OS change", () => {
    // The listener re-reads the cookie; if it captured the value once at load,
    // flipping the toggle and then the OS would undo the person's choice.
    const os = fakeOs(false);
    run();
    setCookie("light");
    os.switchTo(true);
    expect(isDark()).toBe(false);
  });

  it("removes a server-set .dark when the OS says light and nothing was chosen", () => {
    document.documentElement.classList.add("dark");
    fakeOs(false);
    run();
    expect(isDark()).toBe(false);
  });

  it("does not throw when matchMedia is missing", () => {
    // @ts-expect-error — simulating an environment without it
    window.matchMedia = undefined;
    document.documentElement.classList.add("dark");
    expect(run).not.toThrow();
    // …and leaves the server's decision standing.
    expect(isDark()).toBe(true);
  });
});

describe("the CSP lets it run", () => {
  it("allows an inline script in production", () => {
    /*
     * The script is inline, so it lives or dies by script-src. Production
     * allows 'unsafe-inline' today; headers.ts names nonce-based CSP as a
     * planned refinement. If that lands without the script carrying the nonce,
     * the browser drops it silently and every first visit is light again —
     * with no error anywhere. This makes that change fail here instead.
     */
    const csp =
      buildSecurityHeaders(true).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(/'unsafe-inline'|'nonce-/.test(scriptSrc)).toBe(true);
  });
});
