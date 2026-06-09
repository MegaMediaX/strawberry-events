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
