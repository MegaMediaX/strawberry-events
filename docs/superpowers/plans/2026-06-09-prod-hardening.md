# Production Hardening (Milestone 12) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Security response headers, cookie/transport hardening, and rate limiting on auth + public endpoints. Final milestone.

Spec: `docs/superpowers/specs/2026-06-09-prod-hardening-design.md`

---

## Chunk 1: security headers + cookie hardening (TDD)

### Task 1: headers helper + next.config
- [ ] `lib/security/headers.ts` `buildSecurityHeaders(isProd)` (CSP, HSTS prod-only, nosniff, frame-deny, referrer, permissions-policy, dns-prefetch). Unit test. Commit.
- [ ] Wire into `next.config.ts` `headers()` + `poweredByHeader: false`. `lib/auth/config.ts`: `useSecureCookies` when prod/https. Build. Verify pages still load (no CSP breakage) in preview. Commit.

---

## Chunk 2: rate limiting (TDD)

### Task 2: generic limiter
- [ ] `lib/security/rate-limit.ts` `rateLimit(key, limit, windowMs)` + reset helper. Tests (allow→block→reset). Commit.

### Task 3: apply to registration + login
- [ ] `registerAction`: IP-keyed limit (10/min) → friendly error. `authorize`: email-keyed limit (5 / 5min) → generic reject. Tests. Commit.

---

## Chunk 3: verify + docs + project complete

### Task 4
- [ ] lint + typecheck + test + smoke + build green; live-verify headers present (`curl -I`) + pages load + login/registration still work. README "Production hardening" section. Commit. Open PR. Update memory: program complete (M1–M12).

---

## Notes
- DRY: single `buildSecurityHeaders` + single `rateLimit`. YAGNI: no nonce CSP, no Redis, no WAF.
- Don't break the app: CSP allows inline styles + Next hydration scripts (pragmatic baseline; document strict-CSP follow-up). Verify live before finalizing.
