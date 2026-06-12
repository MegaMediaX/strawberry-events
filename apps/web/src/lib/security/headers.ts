export interface HeaderEntry {
  key: string;
  value: string;
}

function buildCsp(isProd: boolean): string {
  // Next.js hydration bootstrap uses inline scripts (pragmatic baseline — strict
  // nonce-based CSP is a documented future refinement). React's DEV build also uses
  // eval() for debugging, so 'unsafe-eval' is allowed in development only; production
  // React never uses eval and keeps the stricter policy.
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const directives = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    // Tailwind v4 + component inline styles require 'unsafe-inline' for styles.
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  // In production, auto-upgrade any stray http:// subresource to https so an
  // admin-supplied http map/cover URL can never make a page "mixed content".
  // Omitted in dev, where the app is served over http://localhost.
  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/**
 * Security response headers applied to every route. HSTS is emitted only in
 * production (avoids pinning HTTPS during local http development).
 */
export function buildSecurityHeaders(isProd: boolean): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: buildCsp(isProd) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return headers;
}
