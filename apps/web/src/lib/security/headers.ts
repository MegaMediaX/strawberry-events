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
    // QZ Tray is a local app the staff machine runs to reach the USB thermal
    // printer; the browser talks to it over a LOCALHOST WebSocket. Those
    // origins are not 'self', so a bare "connect-src 'self'" makes the browser
    // refuse the connection before QZ ever sees it — and print-client.ts then
    // reports "Is QZ Tray running?", which sends you off reinstalling QZ Tray
    // while the real cause is this header. Ports 8181/8182 are QZ's secure
    // pair, 8183 its plaintext fallback; localhost.qz.io resolves to 127.0.0.1
    // and exists so QZ can present a valid certificate for wss.
    //
    // This grants nothing to a remote attacker: these origins are the user's
    // own machine, reachable only from that machine.
    "connect-src 'self' wss://localhost:* ws://localhost:* wss://127.0.0.1:* ws://127.0.0.1:* wss://localhost.qz.io:*",
    "font-src 'self' data:",
    // Allow embedding Google Maps (event location iframe); we still frame nothing else.
    "frame-src 'self' https://www.google.com https://maps.google.com",
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
    // camera=(self), NOT camera=(). An EMPTY allowlist denies every origin
    // INCLUDING our own, which silently kills getUserMedia — and with it the
    // check-in QR scanner, whose only feedback is "Camera unavailable — check
    // browser permissions", pointing staff at macOS settings rather than at
    // this line. Microphone and geolocation stay fully denied; nothing here
    // uses them.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
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
