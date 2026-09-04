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
      /**
       * `/my-tickets` and `/my-registrations` were two pages listing the same
       * rows, reached from different places and already drifting apart. The
       * survivor is `/my-registrations`, which projects each row explicitly and
       * only exposes a QR once the registration is issued.
       *
       * Kept as a redirect rather than simply deleted: this path was the
       * post-login landing and the nav link for the whole 2026 cycle, so it is
       * in browser histories and bookmarks.
       *
       * `permanent: false` (307) on purpose — a 308 is cached by the browser
       * indefinitely and would outlive any decision to reuse the path.
       */
      {
        source: "/my-tickets",
        destination: "/en/my-registrations",
        permanent: false,
      },
      {
        source: "/:locale/my-tickets",
        destination: "/:locale/my-registrations",
        permanent: false,
      },
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
