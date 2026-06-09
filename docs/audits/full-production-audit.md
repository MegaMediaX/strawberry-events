# Strawberry Events Platform — Full Production Audit

**Date:** 2026-06-10
**Branch:** `audit/full-production-review`
**Auditors:** senior production auditor + 8 parallel specialist reviewers (auth/isolation, registration/payment/approval, seats/waitlist/check-in/badges, API/webhooks, secrets/integrations/audit/archive, architecture/DB, public/security-headers/i18n, devops/backup).
**Method:** direct source review (read-only) + command suite (`lint`/`typecheck`/`test`/`smoke`/`build`/`npm audit`/`npm outdated`) + reuse of the existing gated live e2e suites (real pretix + real DB) and `curl` header/route checks. No product features were added; this is report-first.

> **Note on the live event-day simulation (Part 25):** the business flows were verified through the project's **gated live integration/e2e suites** (registration free/COD/approval → `m7.e2e`; check-in + badge → `checkin.e2e`; seat hold/confirm/release + waitlist join/promote → `seats service.integration`; finance mark-paid → `finance service.integration`) which pass against a real dockerized pretix + Postgres, plus `curl` checks for security headers, `/api/v1/me`, DELETE→405, and admin-route gating. A full manual browser click-through was **not** performed end-to-end because the headless preview browser cannot drive the react-hook-form login (a test-harness limitation, not an app bug — real browser login works). This is called out rather than hidden.

---

## 1. Executive Summary

The platform is **architecturally sound and functionally complete** across all 12 milestones. The pretix adapter boundary is clean, pretix remains the source of truth, prices are recomputed server-side, and — most importantly — **multi-organization/event isolation holds at the service layer**: no cross-tenant read/write path was found. The QR/ticket gate (`registrationState === "issued"`) is correctly enforced everywhere it renders. Build is green, 218 tests pass, no high/critical dependency vulnerabilities.

However, the audit found a set of **deploy-time security blockers** (no fail-fast env validation; `change_me` secret defaults that flow into production via compose; constant-string fallbacks for `AUTH_SECRET`/magic-link signing; no TLS in the provided nginx), several **correctness/operations bugs that will bite on event day** (an already-issued ticket can be *rejected* and revoked; seat confirm is not scoped to the holder and seats are never released on cancel; `accessible` seats can't actually be booked), an **intra-org RBAC gap** (Finance can mutate events/tickets via direct server actions), and **two notable feature gaps versus the spec** (modular per-ticket form fields are entirely unbuilt; the public/registration UI is hardcoded English so the Arabic experience is broken below the home page).

None of these are cross-tenant data breaches, and most are well-contained and quick to fix. But several are genuine production blockers.

## 2. Overall Readiness Rating

**Production candidate — conditional. NOT production-ready as-is.**

- ✅ **Soft-launch ready** for a *controlled* scenario: a single trusted organizer, English, GA/free + COD tickets, behind a TLS-terminating proxy (e.g. Cloudflare full-strict), with secrets manually hardened — **after** clearing the CRITICAL items below.
- ❌ **Not production-ready** for public, multi-organizer, **seated**, or **bilingual** deployment until the CRITICAL + HIGH items are resolved.

**Go/No-Go:** **NO-GO** for public production until §3 (CRITICAL) and the event-day HIGH items (§4: H1, H2, H3, H4) are fixed and re-verified. **Conditional GO** for an internal/controlled soft-launch once §3 is cleared.

---

## 3. Critical Blockers (must fix before production)

| # | Finding | Files | Fix |
|---|---|---|---|
| **C1** | **No fail-fast secret validation, and weak defaults flow to production.** There is no env-validation module. `compose.yaml` supplies `AUTH_SECRET:-change_me`, `PRETIX_API_TOKEN:-change_me`, `SEED_ADMIN_PASSWORD:-ChangeMe!123`, DB password `:-password`. `magic-link.ts` signs with `MAGIC_LINK_SECRET \|\| WEBHOOK_SECRET \|\| "dev-secret"`. If any are unset at deploy, prod boots with **publicly-known secrets → forgeable JWT sessions and forgeable magic-link ticket access.** | `compose.yaml:84-92`, `apps/web/src/lib/tokens/magic-link.ts:4`, `apps/web/src/lib/auth/config.ts:13` | Add a boot-time `env.ts` (zod) that **fails fast in production** if `AUTH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `PRETIX_WEBHOOK_SECRET`, `MAGIC_LINK_SECRET` are missing/short/`change_me`. Remove `:-change_me`/`:-password` secret defaults from prod compose. |
| **C2** | **No TLS in the provided deployment.** `docker/nginx.conf` listens on port 80 only — no 443, no cert, no HTTP→HTTPS redirect. HSTS is emitted in prod (`headers.ts`) but unbacked, and `Secure` cookies will not transmit over plain HTTP → **broken login in prod** unless something else terminates TLS. | `docker/nginx.conf:10`, `compose.yaml:107-110` | Terminate TLS at Cloudflare (full-strict) **or** add an nginx 443 server block + certbot/Let's Encrypt + HTTP→HTTPS redirect. Document it. Without this, do not expose to the internet. |
| **C3** | **Live credentials sit in plaintext in the working tree.** `apps/web/.env` contains a real-looking `PRETIX_API_TOKEN` and a valid `ENCRYPTION_KEY`. `.env` is gitignored (confirmed not committed), but these are real secrets on disk and were shared in-session. | `apps/web/.env:1,6,8` | **Rotate the pretix token and `ENCRYPTION_KEY`** before go-live; keep only `.env.example` placeholders in the tree. Document that **losing `ENCRYPTION_KEY` permanently destroys all stored integration secrets** (no backup recovery). |

> C2 is "conditional": if you deploy strictly behind Cloudflare with TLS at the edge and origin locked to Cloudflare, the practical risk drops — but the provided compose/nginx as-is is HTTP-only, so it is a blocker until the TLS story is implemented **and documented**.

---

## 4. High-Priority Issues (fix before a real event)

| # | Finding | Files | Fix |
|---|---|---|---|
| **H1** | **An already-issued (paid) ticket can be rejected/revoked, and approvals are not idempotent.** `approve()`/`reject()` never check the order's current `approvalStatus`/`status`. A second approve re-runs mark-paid, re-emits webhooks, re-sends email, writes duplicate audit. `reject()` on an `issued` order flips it to `canceled/rejected` and cancels the pretix order — **revoking a valid attendee's ticket.** | `apps/web/src/lib/approval/service.ts:66-71,93-180` | Guard transitions: assert `approvalStatus === "pending"` before mutating; use a conditional update (`where: { id, approvalStatus: "pending" }`) to close the TOCTOU. |
| **H2** | **Seat integrity bugs (seated events).** (a) `confirmSeats` matches `state:"temporarily_held"` with **no holder/`attendeeRef` filter** → can confirm another order's held seat; (b) hold→confirm→order-create is **non-transactional** and seats are reserved **after** the pretix order, so failures orphan orders / lose seats; (c) `releaseSeats` is **never called** on cancel/reject → seats leak `sold_or_reserved` forever; (d) `holdSeats` matches only `state:"available"` so **`accessible` seats can't be booked** though the UI offers them; (e) seat ids aren't validated to belong to the event (cross-event hold). | `apps/web/src/lib/seats/service.ts:40-77`, `apps/web/src/lib/registration/service.ts:71-84`, `apps/web/src/components/seats/seat-selector.tsx:21-23` | Filter confirm by `attendeeRef`; wrap hold+confirm+order in `$transaction` with compensating `releaseSeats` on failure; call `releaseSeats(orderCode)` on cancel/reject; include `accessible` in holdable set and add `eventMappingId` to the hold/confirm where-clause. |
| **H3** | **Intra-org RBAC gap: Finance can create/edit events and tickets.** `events/service.ts` mutations enforce only `canAccessEvent` (true for finance org-wide) — **no role check**. The `(admin)` layout allows `finance`, and server actions are directly invokable independent of page guards, so a finance user can call `createEventAction`/`updateEventAction`/`createTicketAction`. | `apps/web/src/lib/events/service.ts:56,147,188`, `apps/web/src/app/[locale]/(admin)/admin/events/actions.ts:31,59,85` | Add `assertRole(session, ["super_admin","organizer_admin"])` + impersonation guard at the top of `createEvent`/`updateEvent`/`createTicket`, mirroring finance/approval/checkin services. |
| **H4** | **Inbound pretix webhook secret is weak.** Accepted via **URL query string** (`?secret=`, leaks to logs/proxies) and compared with non-constant-time `!==` (timing oracle); no HMAC. | `apps/web/src/lib/pretix/webhooks.ts:20-25` | Require the secret via header only; compare with `crypto.timingSafeEqual`; verify pretix's real HMAC if available. |
| **H5** | **Modular/custom per-ticket form fields are entirely unbuilt.** `CustomFormField`/`CustomFormAnswer` exist in Prisma but have **zero** application references — not collected, validated, saved, or shown in admin/approval. (Spec Part 5 expects them.) | `prisma/schema.prisma:438-475`; absent from `registration/schema.ts`, wizard | Implement collection→validation→persistence→admin display, **or** explicitly descope and remove the dead schema + docs claims. |
| **H6** | **Public/registration UI is hardcoded English — Arabic is broken below the home page.** No `useTranslations` under `(public)/**` or the wizard; `ar` route renders English chrome ("Discover events", wizard steps, statuses, errors). Only event *content* fields (titleAr/descriptionAr) are bilingual. No Arabic attendee name → no Arabic name on badge. | `apps/web/src/app/[locale]/(public)/**`, `components/registration/registration-wizard.tsx`, `messages/{en,ar}.json` | Wrap public/wizard copy in next-intl; expand message catalogs; decide on Arabic name capture for badges. |
| **H7** | **No health/readiness endpoint.** No `/api/health` or `/api/ready`; the compose web healthcheck fetches `/en` (couples liveness to full i18n+DB render, no readiness signal). Event-day monitoring blind spot. | `apps/web/src/app/api/**`, `compose.yaml:95` | Add `GET /api/health` (process) + `GET /api/ready` (Prisma ping); point healthcheck + external uptime monitor at them. |
| **H8** | **Concurrency races in seat-hold rollback & waitlist position.** `holdSeats` rollback matches by exact `heldUntil` equality (collision risk); `joinWaitlist` computes `position = max+1` via separate read+write with **no unique constraint** → concurrent joins duplicate positions. | `apps/web/src/lib/seats/service.ts:48-69`, `apps/web/src/lib/waitlist/service.ts:21-29`, `prisma/schema.prisma` (waitlist) | Roll back by `id`+`attendeeRef`; add `@@unique([eventMappingId,itemId,position])` and retry-on-conflict (or order by `createdAt` instead of integer positions). |

---

## 5. Medium / Low Issues

**Medium**
- **SMTP dev-log fallback not blocked in production.** `getTransport()` falls back to `jsonTransport` whenever `SMTP_HOST` is unset, regardless of `NODE_ENV` → emails silently "succeed" and bodies are `console.info`'d. *(`apps/web/src/lib/email/service.ts:17,26-27,43-46`)* → In prod, fail/alert if SMTP unset; gate body logging to non-prod.
- **`payBeforeApproval` is a dead flag** — in schema + docs, referenced nowhere in `src`. Setting it has no effect. *(`prisma/schema.prisma:250`)* → implement or remove.
- **Finance `markOrderPaid` doesn't tolerate pretix "already paid".** Unlike register/approve, no try/catch around the pretix call → a raced/desynced order can't be reconciled to paid. *(`apps/web/src/lib/finance/service.ts:78-88`)*
- **Webhook `emit()` delivers synchronously in-request** (awaited in a loop); a slow subscriber adds latency to the user action (still can't break it). Backoff is fixed (60s), not exponential. *(`apps/web/src/lib/webhooks/service.ts:85-108`)*
- **Webhook events declared but never fired:** `attendee.created`, `seat.released`; and `checkin.created`/`badge.printed` **don't fire** for **API-initiated** check-ins (`POST /api/v1/.../checkins` bypasses the check-in service). *(`apps/web/src/lib/webhooks/events.ts`, `app/api/v1/events/[id]/checkins/route.ts:52-67`)*
- **Badge reprints are unlogged/unaudited.** The "Print / reprint" button calls `window.print()` directly — no server call, no `BadgePrintLog{reprint:true}`, no audit. *(`apps/web/src/components/badges/badge-print-dialog.tsx:27`)*
- **Role/membership changes and impersonation start/stop are not audited.** Privilege grants leave no trail. *(no membership audit anywhere; `audit/service.ts` has the field only)*
- **No `$transaction` boundaries** for multi-write flows (registration, check-in) → partial-failure leaves orphan pretix orders / inconsistent local state. *(`registration/service.ts:71-127`, `checkin/service.ts:90-117`)*
- **Unbounded growth + no scheduler.** `WebhookDelivery`, `AuditLog`, purged `ArchiveQueue` grow forever; `cleanup()`/`retryDue()` exist but are invoked only by tests. No cron/CLI entrypoint. *(`archive/service.ts:129`, `webhooks/service.ts:97`)*
- **Prod seed likely fails in the standalone image.** Documented `docker compose exec next-app npx prisma db seed` needs `tsx` (devDep) + `prisma/seed.ts`, which the runner stage doesn't include → can't create first admin as documented. *(`apps/web/Dockerfile:34-38`, README)*
- **Backup gaps:** local-only (no off-host/rotation/retention), no restore drill, `restore.sh` pipes into `psql` without recreating the DB. *(`scripts/backup.sh`, `scripts/restore.sh`)*
- **Missing hot-column indexes:** `AttendeeOrder.status` / `(eventMappingId,orderCode)`, `SeatAssignment.heldUntil`. *(`prisma/schema.prisma`)*
- **`ReminderSetting` has no FK/relation** to org/event → dangling rows on delete. *(`prisma/schema.prisma:523-536`)*
- **Spoofable rate-limit key:** registration IP comes from raw `x-forwarded-for` (first token), bypassable by rotating the header; waitlist join isn't rate-limited at all. *(`register/actions.ts:9-16`, `waitlist-actions.ts`)*

**Low**
- `my-tickets` renders the magic-link token in markup for terminal-state orders (QR still gated; cosmetic leak). *(`my-tickets/page.tsx:45-50`)*
- Check-in falls back to `orderCode` as the pretix secret when `pretixSecret` is null → redeem against wrong/absent position; block instead. *(`checkin/service.ts:94`)*
- Promotion email hardcoded `locale="en"`. *(`waitlist/service.ts:90`)*
- Badge layout: fixed 30px name, no wrap/RTL → long/Arabic names overflow the 4in width. *(`badge-template.tsx:47`)*
- `reject()` swallows pretix-cancel failure silently (seat/ticket may stay live in pretix). *(`approval/service.ts:157-166`)*
- CSP keeps `'unsafe-inline'` for `script-src` in prod (Next hydration); `'unsafe-eval'` correctly dev-only. *(`headers.ts:11-19`)*
- UI `selectable()` duplicates `canSelect()` but omits the expired-hold rule (cosmetic divergence). *(`seat-selector.tsx:21-23`)*

---

## 6. Security Findings (summary)
- **PASS — no cross-tenant breach.** Org/event isolation enforced at the service layer (`scopeWhere`/`canAccessEvent`); active-org switching restricted to super-admin; API keys org- and event-scoped; archive/audit/integrations all org-isolated. This is the most important result.
- **PASS** — secrets encrypted at rest (AES-256-GCM), never returned to UI (redacted to `configured` flags), pretix token never displayed; API keys hashed (raw shown once); no tokens/keys in `console` logs; login generic-null (no enumeration) + 5/5min limit; secure cookies in prod; full security-header set + `poweredByHeader:false`.
- **Blockers/risks:** C1 (env/secret defaults), C2 (TLS), C3 (creds on disk), H4 (webhook secret), impersonation guards present but currently dead code (feature unbuilt — INFO).

## 7. Permission / Isolation Findings (summary)
- **PASS** — finance/check-in/impersonation correctly blocked from approve, mark-paid (checkin), promote, purge, integration-edit, key/webhook management; cross-org denied on all of these.
- **GAP — H3:** events/tickets service has **no role gate** (finance can mutate). The single material privilege-escalation path found.
- **Minor:** `listWaitlist` authorizes only the first row (safe today, fragile); `liveCounters` skips the role gate (read-only).

## 8. Payment / Ticketing Findings (summary)
- **PASS** — QR gated to `issued` across confirmation / `t/[token]` / `my-tickets`; free→issued (with $0 auto-paid tolerance); COD→pending_payment; approval→pending_approval; mark-paid idempotent (local), org-scoped, audited, impersonation-blocked; client prices never trusted.
- **Bugs — H1** (reject revokes issued ticket; non-idempotent approve), **Medium** (finance mark-paid not tolerant of pretix already-paid), **Medium** (`payBeforeApproval` dead).

## 9. Check-in / Badge Findings (summary)
- **PASS** — eligibility strictly `issued`; pending/rejected/canceled/unpaid blocked; wrong-event/org blocked; redeem idempotent via pretix `already_redeemed`; tags exactly MEDIA/PARTNER/STAFF/VISITOR/SPEAKER (no sponsor); 4×6 print CSS correct; QR = pretix secret.
- **Gaps** — reprints unlogged/unaudited (Med); badge components ungated if reused outside the check-in path (Med); `pretixSecret`-null fallback (Low); Arabic/long-name overflow (Low).

## 10. API / Webhook Findings (summary)
- **PASS** — `{data,meta,error}` envelope, pagination, 401/403/expired/revoked/read-only/cross-org/cross-event all enforced; **DELETE→405 on every route**; DTOs whitelist fields (no pretix secrets/magic links/cross-org); HMAC-signed outbound webhooks with timestamp/delivery/event headers; delivery failure never breaks the action; disabled/event-scoped/cross-org webhook rules enforced; config changes audited.
- **Gaps** — H4 (inbound secret); Medium (3 events not fired / API check-in bypasses emits; synchronous delivery; OpenAPI mismatches: 405 not documented uniformly, `webhooks:manage` scope has no public endpoint, `ping` test event undocumented).

## 11. Deployment / Ops Findings (summary)
- **EXISTS:** standalone Dockerfile, automated `migrate deploy`, compose healthchecks + ordered `depends_on`, nginx reverse proxy, backup/restore scripts (app DB + pretix DB + pretix volume), seed, pretix bootstrap, security headers/cookies/rate-limit, encrypted secrets.
- **MISSING:** TLS (C2), health/readiness (H7), cron for `cleanup()`/promotion, backup retention/off-host/restore-drill, observability (logs/metrics/error-tracking/alerting), edge rate-limiting + Cloudflare real-IP, firewall/host-hardening docs, a working prod seed path, an `ENCRYPTION_KEY`-loss warning.

## 12. Test Results (this audit run)
| Command | Result |
|---|---|
| `npm run lint` | ✅ exit 0 |
| `npm run typecheck` | ✅ exit 0 |
| `npm test` | ✅ **218 passed, 33 skipped** (44 files passed, 12 skipped) |
| `npm run smoke` | ✅ 13 passed |
| `npm run build` | ✅ exit 0, compiled successfully |
| `npm audit` | ⚠️ **7 vulnerabilities (2 low, 5 moderate; 0 high/critical)** — nodemailer SMTP-injection (transitive via next-auth; "no fix" at chain root), postcss XSS-in-stringify (via next's bundled copy; fix only via next downgrade — effectively a non-actionable transitive). |
| `npm outdated` | next 16.2.7→16.2.9 (patch), react 19.2.4→19.2.7, typescript 5.9.3→**6.0.3** (major — hold), @types/node 20→25 (major — hold), nodemailer 7→8 (major), next-auth on 5.0.0-beta.31 (beta, pinned). |

> The 33 skipped tests are the **gated** live/integration suites (`E2E_LIVE`/`TEST_DATABASE_URL`); they pass when run against the docker stack (re-confirmed this session). No flaky or silently-failing tests observed.

## 13. Manual QA Results
- `/en/events` 200, renders, no Prisma/script errors; security headers present via `curl -I`; `/api/v1/me` returns correct envelope; `DELETE` → 405; admin `integrations`/`audit`/`delete-queue` → 307→login when unauthenticated.
- Business flows verified via the live e2e/integration suites (see method note). Full manual browser click-through deferred due to the headless-login harness limitation (real-browser login confirmed working separately).
- **Test-coverage gaps worth adding:** unit tests for the H1 approval state-guard, H2 seat confirm-scoping/release-on-cancel, and H3 events-role-gate once fixed.

## 14. Recommended Fixes (priority order / quick wins)
**Quick wins (hours):** H3 (add role guard to events service), H1 (state guard in approve/reject), H4 (header-only + `timingSafeEqual`), finance mark-paid try/catch, badge reprint server action + audit, add `/api/health`+`/api/ready`, add waitlist unique constraint + AttendeeOrder/SeatAssignment indexes, `ReminderSetting` FK, block SMTP dev-log in prod, gate `my-tickets` link.
**Blockers (1–2 days):** C1 env validator + strip compose secret defaults, C2 TLS story, C3 rotate creds + key-loss docs, H2 seat transaction/scoping/release, H6 Arabic i18n of public+wizard.
**Larger:** H5 modular fields (implement or descope), scheduler for `cleanup()`/`retryDue()` + retention, async webhook delivery, transactions for registration/check-in, backup retention/off-host/restore-drill, observability.

## 15. Deferred Roadmap Items (confirmed deferred, non-blocking)
Whish live payment, live WhatsApp/SMS sending, Redis-backed distributed rate limiting, visual seat-map editor, automatic waitlist-promotion scheduler, webhook delivery dashboard, OAuth, walk-in registration, standalone badge reprint page, nonce-based strict CSP, production nginx/compose hardening, dependency-audit remediation. **Add:** modular form fields (H5) and full Arabic UI i18n (H6) are currently *unbuilt features*, not just polish — treat as roadmap, not "done."

## 16. Final Go / No-Go
**NO-GO for public production** until **C1, C2, C3** and **H1, H2, H3, H4** are fixed and re-verified (with H7 health endpoint added for monitoring). **Conditional GO for a controlled internal soft-launch** (single trusted org, English, GA/free/COD, behind edge TLS) once **C1 + C3** are cleared and TLS (C2) is in place. The foundation is strong and the fixes are well-scoped; this is a close, fixable candidate — not a rewrite.
