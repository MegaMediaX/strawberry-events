# Audit Blockers — Remediation Report

**Date:** 2026-06-10
**Branch:** `fix/audit-blockers`
**Source of truth:** `docs/audits/full-production-audit.md`, `docs/audits/event-day-checklist.md`
**Scope:** Fix the CRITICAL deploy blockers (C1–C3) and the quick HIGH-risk findings (H1–H8). No new product features. Stashed date-picker work, Whish live payments, live WhatsApp/SMS, and OAuth were intentionally left untouched.

---

## 1. Executive summary

All three CRITICAL blockers and all eight targeted HIGH findings from the production audit are fixed, with tests. The app now **fails fast in production** on missing/weak secrets, **never serves public production over plain HTTP unknowingly** (documented + compose hardened), ships **no real secrets**, and closes the event-day correctness risks: an issued ticket can no longer be silently revoked, seats are holder-scoped and released on cancel/reject, Finance can no longer edit events/tickets, the inbound webhook secret is timing-safe and header-only, mark-paid can’t partially issue on pretix failure, and SMTP never fakes success in production. Health endpoints were added for monitoring and practical DB indexes were migrated.

**Validation:** lint ✅ · typecheck ✅ · **256 tests pass / 36 skipped** (+38 new) · smoke 13 ✅ · build ✅ · `npm audit` 0 high/critical. Manual QA on health/events/DELETE ✅.

## 2. CRITICAL fixed

| ID | Fix | Key files |
|----|-----|-----------|
| **C1** | Production env fail-fast. New `lib/config/env.ts` (`validateEnv`/`assertProductionEnv`) rejects missing/empty/weak/placeholder secrets (`change_me`, `dev-secret`, `secret`, `password`, …) in production for AUTH_SECRET, MAGIC_LINK_SECRET, ENCRYPTION_KEY (must be base64-32B), PRETIX_API_TOKEN, PRETIX_BASE_URL, PRETIX_WEBHOOK_SECRET, DATABASE_URL, APP_URL (https), and SMTP. Wired at server startup via `instrumentation.ts`. Magic-link signing now **requires** `MAGIC_LINK_SECRET` in production (no public-constant fallback). Error messages never include secret values. | `apps/web/src/lib/config/env.ts`, `apps/web/src/instrumentation.ts`, `apps/web/src/lib/tokens/magic-link.ts` |
| **C2** | TLS clarity. README **“Production deployment & TLS (required)”** — explicit “do not run public production over plain HTTP”, secure-cookies-need-HTTPS, HSTS-needs-HTTPS, plus the two supported options (Cloudflare full-strict / nginx 443) and Cloudflare real-IP guidance. | `README.md` |
| **C3** | Secrets hygiene. No real secret is committed (verified: `.env` is gitignored; repo scan found only placeholders/detection-code). `.env.production.example` added (placeholders only) with **rotation + ENCRYPTION_KEY-loss** guidance; `.env.example` gains MAGIC_LINK_SECRET + ALLOW_EMAIL_DISABLED_IN_PRODUCTION. `compose.yaml` wires the required secret vars (with dev-friendly fallbacks so `docker compose` parses without a root `.env`); the **app-level startup validator (C1) is the authoritative production fail-fast** on weak/placeholder values. | `.env.production.example`, `.env.example`, `compose.yaml` |

## 3. HIGH fixed

| ID | Fix | Key files |
|----|-----|-----------|
| **H1** | Safe approval transitions. `approve`/`reject` are idempotent; rejecting an **issued/approved** order is blocked (no silent QR revocation); approving a rejected order is blocked; transitions use a conditional `updateMany` (closes the double-decision TOCTOU race). | `apps/web/src/lib/approval/service.ts` |
| **H2** | Seat integrity. `confirmSeats` is **holder-scoped** (`attendeeRef === orderCode`) and verifies count; `holdSeats` includes `accessible` seats and scopes the where-clause to the event; registration holds+confirms with **compensating release + pretix cancel** on failure; `reject()` releases the order’s seats. | `apps/web/src/lib/seats/service.ts`, `apps/web/src/lib/registration/service.ts`, `apps/web/src/lib/approval/service.ts` |
| **H3** | Finance role gate. `assertCanManageEvents` (super/organizer only, impersonation blocked) at the top of `createEvent`/`updateEvent`/`createTicket` — service-layer, not UI-only. Seat/waitlist config (set via `updateEvent`) is covered. | `apps/web/src/lib/events/service.ts` |
| **H4** | Webhook secret. Header-only (`X-Pretix-Webhook-Secret`; query-string rejected), `crypto.timingSafeEqual` via new `lib/security/compare.safeEqual`, 503 when unconfigured, 401 on mismatch; never logs the secret. Production also requires a strong `PRETIX_WEBHOOK_SECRET` (C1). | `apps/web/src/lib/pretix/webhooks.ts`, `apps/web/src/lib/security/compare.ts` |
| **H5** | Mark-paid safety. On a real pretix sync failure the local status is **not** flipped (no partial issue / no QR) and the failure is audited (`order.mark_paid_failed`, `success:false`); pretix “already paid” is tolerated and reconciled; remains idempotent. | `apps/web/src/lib/finance/service.ts` |
| **H6** | Health endpoints. `/api/health` (liveness), `/api/health/db` (DB → 200/503), `/api/health/ready` (config + DB → 200/503). Coarse ok/error only; no secrets/var names leaked. | `apps/web/src/app/api/health/**` |
| **H7** | Production SMTP safety. `emailMode()` = smtp / dev-log / disabled; production with no SMTP is **disabled** (returns false, logs a warning) and **never fakes success**; missing SMTP in production fails startup unless `ALLOW_EMAIL_DISABLED_IN_PRODUCTION=true`. | `apps/web/src/lib/email/service.ts`, `apps/web/src/lib/config/env.ts` |
| **H8** | Performance indexes. Migration `add_perf_indexes`: AttendeeOrder `(eventMappingId,orderCode)`, `(eventMappingId,status)`, `(eventMappingId,approvalStatus)`; SeatAssignment `heldUntil`, `attendeeRef`; WebhookDelivery `(success,nextRetryAt)`. Applies cleanly; schema up to date. | `apps/web/prisma/schema.prisma`, `prisma/migrations/20260610000749_add_perf_indexes` |

## 4. Remaining risks (not in this PR’s scope)

- **TLS is documented, not enforced by code** — operators must actually configure Cloudflare/nginx (the bundled nginx is still HTTP-only). C2 is a documentation+compose fix, not an automatic TLS setup.
- **`apps/web/.env` on the developer’s disk still holds the real dev pretix token + ENCRYPTION_KEY** (gitignored, not committed). It must be **rotated** before production per `.env.production.example`.
- **Cron not wired** — `cleanup()`/`retryDue()` and waitlist promotion remain admin-invoked (documented; scheduler deferred).
- **Accessible-seat designation** is not preserved across a hold cycle (a released accessible seat becomes `available`) — a documented limitation of the single-state enum; bookability/blocked/release all work.
- **Synchronous webhook delivery, in-memory rate limiting, modular form fields, full Arabic UI i18n, observability/backups** — these audit findings are **out of scope** here and remain on the roadmap (see the main audit report §4–§5, §15).
- **`npm audit`**: 0 high/critical; the moderate items are transitive (nodemailer via next-auth, postcss bundled in next) with no non-breaking fix — left as-is and tracked.

## 5. Verification performed
lint ✅ (0) · typecheck ✅ (0) · `npm test` ✅ **256 passed / 36 skipped** · `npm run smoke` ✅ 13 · `npm run build` ✅ · `npm audit` ⚠️ 7 (2 low, 5 moderate, **0 high/critical**).

## 6. Commands run
```
npm run lint            # 0
npm run typecheck       # 0
npm test                # 256 passed | 36 skipped
npm run smoke           # 13 passed
npm run build           # compiled successfully
npm audit               # 7 (2 low, 5 moderate); 0 high/critical
# required leaked-secret scan:
grep -R "change_me|dev-secret|wbymtzlc" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
#   → only .env*.example placeholders, the prompt doc, detection code/tests, and the
#     gitignored local apps/web/.env (not committed; flagged for rotation).
```

## 7. Manual QA results
- `/en/events` → 200, renders cleanly.
- `/api/health` → 200 `{"status":"ok","service":"strawberry-events","checks":{}}`.
- `/api/health/db` → 200 `{checks:{db:"ok"}}`.
- `/api/health/ready` → 200 `{checks:{db:"ok",config:"ok"}}` (dev).
- `DELETE /api/v1/events` → **405**.
- Role/state/seat/mark-paid behaviours verified via the new unit + integration tests (headless browser login can’t drive react-hook-form, so service-layer tests are the authority for those flows — real-browser login works).

## 8. Items intentionally deferred
Stashed date-picker work (not restored), Whish live payments, live WhatsApp/SMS sending, OAuth, unrelated UI polish, async webhook delivery, Redis rate limiting, modular form fields, full Arabic UI i18n, observability, automated TLS provisioning, scheduler/cron wiring, backup retention/off-host — all per the audit roadmap and this PR’s stated non-goals.
