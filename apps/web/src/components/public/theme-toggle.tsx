"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import { Press } from "@/components/paper/press";

/**
 * Flips between light and dark and saves the choice.
 *
 * Holds NO React state, on purpose. The page's theme is decided in two places
 * React cannot see into — the server's cookie read and the <head> script that
 * answers "system" before hydration — so any state seeded from the server can
 * disagree with the page. It did: seeded from `cookie === "dark"`, a first-time
 * visitor with a dark OS got a dark page whose toggle believed it was light,
 * so the first click set "dark" and nothing visibly happened.
 *
 * So the DOM is the only source of truth. The icon follows the `.dark` class in
 * CSS, which also removes the hydration mismatch a state-driven icon would
 * cause, and a click reads the class at the moment it happens.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    const value = next ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next);
    // A cookie, so the server themes the next load itself (no script needed for
    // an explicit choice). The <head> script re-reads it on OS changes, so
    // this choice also outranks a later switch of the system theme.
    document.cookie = `${THEME_STORAGE_KEY}=${value};path=/;max-age=31536000;samesite=lax`;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore storage failures
    }
  }

  return (
    <Press
      variant="quiet"
      size="icon"
      className="size-10"
      aria-label="Toggle theme"
      onClick={toggle}
    >
      {/* Shows what a click switches TO: the sun in dark, the moon in light. */}
      <Sun aria-hidden="true" className="hidden size-4 dark:block" />
      <Moon aria-hidden="true" className="block size-4 dark:hidden" />
    </Press>
  );
}
