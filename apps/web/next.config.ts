import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /**
   * The badge QR encodes an UPPERCASE path so the encoder can use QR
   * alphanumeric mode, which is ~31% denser than byte mode — lowercase would
   * push the symbol past the space the label reserves for it. URL paths are
   * case-SENSITIVE, so `/C/<slug>` never matches the `/c/[slug]` route.
   *
   * Locale prefixing compounds it: an unprefixed path is redirected to
   * `/en/...`, so a page outside `[locale]` is unreachable no matter its case.
   * Both together meant every printed badge QR resolved to a 404.
   *
   * These run before routing, so they fix both in one hop.
   */
  async redirects() {
    return [
      { source: "/C/:slug", destination: "/en/c/:slug", permanent: false },
      { source: "/c/:slug", destination: "/en/c/:slug", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
};

export default withNextIntl(nextConfig);
