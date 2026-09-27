import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

/**
 * `/` and `/en` must reach the events index in ONE hop. They used to take two
 * (next-intl's 307 to `/en`, then that page's own redirect, which arrived as a
 * 200 plus a one-second meta refresh because the page streams).
 */
describe("the site root lands on the events index directly", () => {
  it.each(["/", "/en"])("%s redirects straight to /en/events", async (source) => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const rule = redirects.find((r) => r.source === source);
    expect(rule).toMatchObject({ destination: "/en/events", permanent: false });
  });
});
