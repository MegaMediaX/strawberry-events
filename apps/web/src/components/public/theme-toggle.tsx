"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme";
import { Button } from "@/components/ui/button";

function currentIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => currentIsDark());

  function toggle() {
    const next = !dark;
    const value = next ? "dark" : "light";
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    // Persist in a cookie so the server renders the right theme on next load
    // (no client init script needed). Mirror to localStorage as a convenience.
    document.cookie = `${THEME_STORAGE_KEY}=${value};path=/;max-age=31536000;samesite=lax`;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore storage failures
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={toggle}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
