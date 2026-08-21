import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { badgeProfileUrl } from "@/lib/checkin/badge-slug";

/**
 * The QR payload and the route that serves it must agree.
 *
 * They did not, and every printed badge resolved to a 404:
 *   - the page lived outside `[locale]`, so `/c/<slug>` was redirected to
 *     `/en/c/<slug>`, which did not exist;
 *   - and the payload is UPPERCASE `/C/` (needed for QR alphanumeric mode),
 *     while URL paths are case-SENSITIVE, so it could never match `/c/`.
 *
 * Neither fault is visible from the page component alone, which is why reading
 * the code found nothing. This asserts the two ends line up.
 */
const configSource = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

describe("the badge QR resolves to a real route", () => {
  it("encodes the uppercase path the redirect expects", () => {
    const path = new URL(badgeProfileUrl("ABC12345").replace("HTTPS://", "https://")).pathname;
    expect(path).toBe("/C/ABC12345");
  });

  it("next.config redirects that uppercase path", () => {
    // Without this the QR points at a path no route matches.
    expect(configSource).toMatch(/source:\s*"\/C\/:slug"/);
    expect(configSource).toMatch(/destination:\s*"\/en\/c\/:slug"/);
  });

  it("also redirects the lowercase path a human might type", () => {
    expect(configSource).toMatch(/source:\s*"\/c\/:slug"/);
  });

  it("the page lives under [locale], where the redirect points", () => {
    // Route groups like (card) are URL-invisible, so moving between them
    // changes the layout without changing the address the QR points at.
    // A page outside [locale] is unreachable: unprefixed paths are redirected
    // to /en/... before routing.
    const page = join(process.cwd(), "src/app/[locale]/(card)/c/[slug]/page.tsx");
    expect(() => readFileSync(page, "utf8")).not.toThrow();
  });

  it("the page still refuses indexing", () => {
    // noindex used to live on a dedicated /c root layout, which this change
    // removed. It must not have been lost in the move — these pages carry
    // attendee names.
    const page = readFileSync(
      join(process.cwd(), "src/app/[locale]/(card)/c/[slug]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/robots:\s*\{[^}]*index:\s*false/);
  });
});

describe("the card renders without the app nav", () => {
  it("lives in its own route group, not (public)", () => {
    // (public) attaches PublicNav — "Sign in", "My tickets", a theme toggle —
    // written for someone with an account. The reader here scanned a stranger's
    // lanyard and will never have one.
    const layout = readFileSync(
      join(process.cwd(), "src/app/[locale]/(card)/layout.tsx"),
      "utf8",
    );
    // Match usage, not the word — the layout's own comment explains why
    // PublicNav is absent, and a bare substring check fails on that.
    expect(layout).not.toMatch(/import\s+\{[^}]*PublicNav/);
    expect(layout).not.toMatch(/<PublicNav/);
  });

  // "always offers Save contact" lived here as a source-position check. It
  // passed with the button both inside and outside the conditional, so it was
  // worthless. It now lives in contact-card.test.tsx, which renders the
  // component and fails when the button is hidden.
});
