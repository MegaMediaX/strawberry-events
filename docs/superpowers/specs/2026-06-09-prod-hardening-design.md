# Milestone 12 — Production Hardening Design

**Date:** 2026-06-09
**Status:** Scope confirmed — **security headers + middleware hardening (+ auth/public rate limiting)**
**Depends on:** M1–M11. Final milestone.

---

## 1. Goal

Harden the HTTP surface for production: security response headers, cookie/transport
hardening, and rate limiting on abuse-prone auth + public endpoints (the external API is
already per-key limited).

## 2. Security headers (`lib/security/headers.ts` → `next.config` headers())

Apply to all routes via `next.config.ts` `headers()`:
- `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data: blob:`;
  `style-src 'self' 'unsafe-inline'` (Tailwind/inline component styles);
  `script-src 'self' 'unsafe-inline'` (Next hydration bootstrap — pragmatic baseline;
  documented, nonce-based strict CSP is a future refinement);
  `connect-src 'self'`; `font-src 'self' data:`; `frame-ancestors 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (prod only).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `X-DNS-Prefetch-Control: off`.
- `poweredByHeader: false` (remove `X-Powered-By`).
A pure `buildSecurityHeaders(isProd)` helper returns the header list (unit-tested);
`next.config` consumes it.

## 3. Cookie / transport

Auth.js v5 already sets `httpOnly` + `sameSite` and `secure` on HTTPS. Ensure
`useSecureCookies` is enabled when `NODE_ENV=production` (or `AUTH_URL` is https) in
`lib/auth/config.ts`. The theme cookie stays non-sensitive (`sameSite=lax`, no secret).

## 4. Rate limiting (`lib/security/rate-limit.ts`)

Generic in-memory fixed-window limiter `rateLimit(key, limit, windowMs)` →
`{ allowed, remaining, resetAt }` (single-instance; documented; Redis upgrade later).
Apply:
- **Public registration** (`registerAction`): keyed by client IP
  (`x-forwarded-for`/`x-real-ip`), default 10/min → friendly "too many attempts" error.
- **Login** (credentials `authorize`): keyed by **email**, default 5 attempts / 5 min →
  reject with a generic error (credential-stuffing/brute-force protection). Counter resets
  on the window; no lockout persistence.
Note: edge/CDN/nginx should also rate-limit; this is defense-in-depth.

## 5. Tests

- `buildSecurityHeaders`: includes CSP, HSTS (prod only), nosniff, frame-deny, referrer,
  permissions-policy; no `X-Powered-By`.
- `rateLimit`: allows up to limit, blocks after, resets after window.
- registration action returns a rate-limit error after N calls from the same IP (unit, mocked).
- login authorize rejects after N failed attempts for an email (unit).

## 6. Docs

README "Production hardening" section: header set + rationale, CSP baseline + strict-CSP
follow-up note, HSTS prod-only, cookie/secure behavior, rate-limit defaults + single-instance
caveat + nginx/CDN recommendation.

## 7. Out of scope

Nonce-based strict CSP, WAF, Redis-backed distributed rate limiting, full dependency-audit
remediation, infra/nginx config changes (documented recommendations only).
