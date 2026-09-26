export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "strawberry.theme";
/** Cookie name read by the server layout to apply the theme during SSR. */
export const THEME_COOKIE = "strawberry.theme";

/** Resolve a (possibly "system") theme preference to a concrete light/dark value. */
export function resolveTheme(
  theme: Theme | undefined,
  prefersDark: boolean,
): ResolvedTheme {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  // "system" or undefined
  return prefersDark ? "dark" : "light";
}

/**
 * Parse the stored preference. Anything other than an explicit "light" or
 * "dark" is "system" — including no cookie at all, which is every first visit.
 */
export function themeFromCookie(value: string | undefined): Theme {
  return value === "dark" || value === "light" ? value : "system";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Sets `.dark` on <html> before first paint. `resolveTheme`, run in the browser.
 *
 * The server can theme an EXPLICIT choice from the cookie, and still does — that
 * path needs no JavaScript at all. What it cannot do is answer "system", because
 * the OS preference never reaches it: it is a media query, not a header. So a
 * first-time visitor with a dark OS was served light, and the layout's
 * `cookie === "dark"` meant `resolveTheme` — correct, and tested — was never
 * consulted. This is the one place that can consult it in time.
 *
 * Deliberately:
 *  - in <head>, synchronous, so it runs before the body paints (no flash);
 *  - re-reads the cookie on every OS change, because an explicit choice made
 *    by the toggle after load must win over a later OS switch;
 *  - wrapped in try/catch — a blocked cookie or a missing matchMedia leaves the
 *    server's class alone rather than throwing in the document head.
 *
 * It needs `script-src 'unsafe-inline'` (or a nonce). The CSP allows the former
 * today and names nonces as a planned refinement; a test pins the two together
 * so that change cannot silently switch this off.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,q=window.matchMedia("(prefers-color-scheme: dark)");function a(){var m=document.cookie.match(/(?:^|;\\s*)${escapeRe(THEME_COOKIE)}=([^;]*)/),t=m?m[1]:"";d.classList.toggle("dark",t==="dark"||(t!=="light"&&q.matches))}a();q.addEventListener("change",a)}catch(e){}})()`;
