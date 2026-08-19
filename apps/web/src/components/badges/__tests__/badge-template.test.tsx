import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BadgeTemplate } from "../badge-template";

/**
 * The browser print path is the fallback when QZ Tray cannot be reached. With
 * badges printed on site there is no pre-printed stack behind it, so this is
 * the last thing between a queue and a working door — and nobody exercises it
 * until the moment it matters.
 */
function css(): string {
  const html = renderToStaticMarkup(
    <BadgeTemplate badge={{ tag: "visitor", fullName: "Test Test", company: "Strawberry" }} />,
  );
  const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  expect(style).not.toBeNull();
  return style![1];
}

describe("the print stylesheet", () => {
  it("prints the badge and nothing else", () => {
    // window.print() prints the WHOLE DOCUMENT. Setting @page alone only
    // resized the paper, so the entire check-in screen was sliced into
    // 60x40mm pages — seen in production as an 8-page job carrying the nav and
    // the counters, and no badge at all.
    const sheet = css();
    expect(sheet).toMatch(/body \*\s*\{[^}]*visibility:\s*hidden/);
    expect(sheet).toMatch(/\.badge-sheet[^{]*\{[^}]*visibility:\s*visible/);
  });

  it("hides via visibility, never display", () => {
    // display:none on an ancestor would take the badge down with it. visibility
    // keeps the ancestors' boxes so the badge can still be positioned.
    expect(css()).not.toMatch(/body \*\s*\{[^}]*display:\s*none/);
  });

  it("sets the page to the real media size", () => {
    expect(css()).toMatch(/@page\s*\{[^}]*size:\s*60mm 40mm/);
  });

  it("uses no inch units in any rule", () => {
    // The label is 40mm tall. A 0.3in padding and 0.4in name margin left over
    // from the old 4x6in layout is ~18mm of whitespace before a single glyph,
    // and the content overflowed the label.
    const rulesOnly = css().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rulesOnly).not.toMatch(/\d\s*in\b/);
    expect(rulesOnly).toMatch(/\dmm/);
  });

  it("keeps the badge to a single page", () => {
    expect(css()).toMatch(/break-after:\s*avoid/);
  });
});
