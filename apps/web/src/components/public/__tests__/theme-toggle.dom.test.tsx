// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../theme-toggle";
import { THEME_COOKIE } from "@/lib/theme/theme";

const isDark = () => document.documentElement.classList.contains("dark");
const cookie = () => document.cookie.match(new RegExp(`${THEME_COOKIE}=([^;]*)`))?.[1];

beforeEach(() => {
  document.documentElement.className = "";
  document.cookie = `${THEME_COOKIE}=; max-age=0; path=/`;
});

describe("ThemeToggle", () => {
  it("switches a page the OS made dark to light on the FIRST click", async () => {
    // The follow-on bug: seeded from `cookie === "dark"`, the toggle thought an
    // OS-dark first visit was light, so its first click set "dark" — no change.
    document.documentElement.classList.add("dark");
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(isDark()).toBe(false);
    expect(cookie()).toBe("light");
  });

  it("switches light to dark and saves it", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(isDark()).toBe(true);
    expect(cookie()).toBe("dark");
  });

  it("round-trips", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "Toggle theme" });
    await user.click(btn);
    await user.click(btn);
    expect(isDark()).toBe(false);
    expect(cookie()).toBe("light");
  });
});
