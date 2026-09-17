import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /**
   * Cuts between routes, via React's <ViewTransition> and the browser's own
   * View Transitions API.
   *
   * This is the ONE experimental flag in the product, and it is worth naming
   * what it does and does not risk. It enables Next's integration only — the
   * component is React's and the animation is the browser's. A browser without
   * the API simply does not animate; the navigation is the same navigation it
   * always was. Nothing renders conditionally on it, no data path touches it,
   * and the registration form is excluded by default rather than by a rule
   * (see lib/motion.ts: a link with no transition type is a cut).
   *
   * The flag is experimental in the sense that its API may change between Next
   * versions, which is an upgrade cost, not a runtime one.
   */
  experimental: {
    viewTransition: true,
  },
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
