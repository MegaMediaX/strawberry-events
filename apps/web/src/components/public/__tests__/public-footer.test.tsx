import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicFooter } from "../public-footer";

describe("public footer", () => {
  const html = renderToStaticMarkup(<PublicFooter locale="en" />);

  it("names the organiser and a way to reach them", () => {
    expect(html).toContain("Strawberry Agency");
    expect(html).toContain('href="mailto:events@strawberryagency.com"');
  });

  it("links the privacy policy and terms under the current locale", () => {
    expect(html).toContain('href="/en/legal/privacy"');
    expect(html).toContain('href="/en/legal/terms"');
  });

  it("is a footer landmark and carries no red", () => {
    expect(html.startsWith("<footer")).toBe(true);
    expect(html).not.toMatch(/bg-primary|text-primary/);
  });
});
