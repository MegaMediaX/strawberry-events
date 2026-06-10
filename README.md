# Strawberry Events Platform

Multi-organizer event registration & operations platform. Next.js 16 frontend/admin
on top of self-hosted **pretix** as the ticketing/order/check-in source of truth.

> **Status:** Milestone 1 (Foundation) complete. See
> `docs/superpowers/specs/2026-06-08-foundation-design.md` and
> `docs/superpowers/plans/2026-06-08-foundation.md`. Milestones 2–12 are planned
> as separate spec → plan → build cycles.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · next-intl (en/ar, RTL)
· Auth.js v5 (credentials, JWT sessions) · Prisma · PostgreSQL · Redis · self-hosted
pretix · Docker Compose · nginx.

## Architecture

```
nginx ──/──> next-app (Next.js) ──> postgres-app (custom layer)
      └─/pretix─> pretix ──> postgres-pretix
                  next-app & pretix ──> redis
```

- pretix is the source of truth for events/orders/tickets/check-ins.
- The custom Postgres DB (`postgres-app`) holds platform-only data: organizations,
  memberships, event mappings, seat maps, badges, approvals, custom fields,
  integrations, API keys, webhooks, audit logs, archive queue.
- All pretix access flows through the adapter in `apps/web/src/lib/pretix`.

## Local development

```bash
cp .env.example .env       # fill AUTH_SECRET (openssl rand -base64 32) etc.
docker compose up -d       # postgres-app, postgres-pretix, redis, pretix, next-app, nginx
```

`next-app` runs `prisma migrate deploy` on start. To seed the first org + super admin:

```bash
docker compose exec next-app npx prisma db seed
```

App: http://localhost:8080 (via nginx) or http://localhost:3000 (direct, if published).
pretix control panel: http://localhost:8080/pretix/

### pretix API token (one-time, dev)

After pretix is up, provision an organizer + API token:

```bash
bash scripts/pretix-bootstrap.sh   # prints PRETIX_API_TOKEN=...
```

Paste the printed value into `.env` as `PRETIX_API_TOKEN`. The adapter's opt-in
live integration suite runs only when `PRETIX_BASE_URL` + `PRETIX_API_TOKEN` are
set:

```bash
cd apps/web
PRETIX_BASE_URL=http://localhost:8081 PRETIX_API_TOKEN=... npx vitest run adapter.live
```

### Local dev database (port 5433)

The dev override publishes the app Postgres on host port **5433** (to avoid clashing
with a local 5432 install). `apps/web/.env` must use it:
`DATABASE_URL=postgresql://app:password@localhost:5433/strawberry_platform`.

Start just the dev DB:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres-app
# then, from apps/web, apply migrations + seed:
DATABASE_URL=postgresql://app:password@localhost:5433/strawberry_platform npx prisma migrate deploy
DATABASE_URL=postgresql://app:password@localhost:5433/strawberry_platform npx prisma db seed
```

### Theme

Theme (light/dark) is resolved **server-side from the `strawberry.theme` cookie** in the
locale layout — no client init script (avoids the React "script tag while rendering"
warning and FOUC). The toggle writes the cookie + localStorage + `documentElement` class.

### Running the app outside Docker

```bash
cd apps/web
npm install
# point DATABASE_URL at a reachable Postgres
npx prisma migrate deploy && npx prisma db seed
npm run dev
```

## Tests

```bash
cd apps/web
npm test          # vitest (password hashing, RBAC guards, org-scope, pretix client)
npm run typecheck
npm run build
```

## Admin (Milestone 4)

Admin events/tickets live under `/<locale>/admin/events`. Multi-organizer
isolation is enforced in `lib/events/service.ts` (every query scoped via
`scopeWhere`/`canAccessEvent`). Super admins switch org via the header dropdown;
others are locked to their org. Per-org pretix tokens are stored encrypted on
`Organization.pretixApiToken` (set `ENCRYPTION_KEY`); the env `PRETIX_API_TOKEN`
is the dev fallback.

Run the events integration test (real DB, mocked pretix):

```bash
cd apps/web
DATABASE_URL=postgresql://... TEST_DATABASE_URL=postgresql://... npx vitest run service.integration
```

The event edit form pre-fills `date_from`/`date_to` by fetching the event from
pretix (the source of truth) via `getEventForEdit`.

## Public registration (Milestone 5)

Premium public storefront under `/<locale>/events`:
- Listing (open + coming-soon), event detail (hero, sticky ticket rail / mobile CTA,
  capacity bar, add-to-calendar), 3-step registration wizard.
- Theme system: light = editorial, dark = immersive, toggle in the nav (persisted).
- Checkout: free events issue a QR ticket instantly; COD events create a pending
  pretix order (ticket withheld until finance marks paid — later milestone).
- Guest access via signed magic link `/<locale>/t/<token>`; account dashboard at
  `/<locale>/my-tickets`.
- Email via SMTP when configured, else a dev transport that logs to the console
  (set `SMTP_HOST` to enable real delivery). Email failures never block registration.

Gated suites:
```bash
cd apps/web
# integration (real DB, mocked pretix)
DATABASE_URL=... TEST_DATABASE_URL=... npx vitest run register.integration
```

## Finance (Milestone 6)

`/<locale>/admin/finance` — order list filterable by status (pending/paid/canceled)
and method (free/COD), order detail, and **Mark paid** for COD/manual orders.
Marking paid syncs pretix, flips `AttendeeOrder` → paid (which enables the ticket QR
in confirmation / `/t/<token>` / `/my-tickets`), sends the confirmation email, and
writes an audit log. Org/event isolation enforced; Finance role sees only assigned
organizations (super admin sees all). Mark-paid is blocked while impersonating
(`SessionContext.impersonating`).

`npm run smoke` runs the fast core-logic suite. OpenAPI is deferred until the external
API milestone (finance uses Server Actions, no public HTTP surface yet).

## Approval + attendee flow (Milestone 7)

Approval is decided per event (`EventMapping.approvalMode`): `none`, `manual`,
`automatic`, `manual_and_automatic`. Per-ticket auto-approval via
`EventMapping.autoApproveItemIds` (e.g. Visitor auto, Media/Partner manual).
`payBeforeApproval` opt-in flag exists; default is approve-first-then-pay.

**State model.** `AttendeeOrder.status` (pending/paid/canceled) is the payment
lifecycle; `approvalStatus` (not_required/pending/approved/rejected) is separate.
The attendee-facing state is **derived** (`lib/approval/state.ts → registrationState`):

| approvalStatus | status | state |
|---|---|---|
| pending | * | pending_approval |
| rejected | * | rejected |
| approved/not_required | canceled | canceled |
| approved/not_required | pending | pending_payment |
| approved/not_required | paid | issued |

Tickets issue only when `status === "paid"`; an order is never marked paid until
approved (or approval not required), so the QR gating is unchanged from M6.

**Flow.** No approval + free → issued instantly. No approval + COD → pending_payment.
Approval required → `pending_approval` (no QR, pending email). On approve: free → issued
+ ticket email; COD → pending_payment + payment-required email. On reject → rejected +
canceled + rejected email. All decisions audited.

**Admin queue** `/admin/approvals` (filter pending/approved/rejected) + detail (attendee +
submitted modular fields) + approve/reject.

**Permissions.** super_admin: all. organizer_admin: assigned org/events. finance &
check-in staff: **cannot** approve/reject. Impersonating sessions are blocked.

**Attendee access.** confirmation / `/t/<token>` / `/my-tickets` all render the derived
state — pending review, rejected, payment instructions, or QR.

## Staff check-in + badges (Milestone 8)

Hybrid model: a **custom browser print-station** at `/<locale>/staff/checkin` plus
**pretixSCAN** (same QR) — pretix check-in lists are the **source of truth**.

- **Eligibility**: only `registrationState === "issued"` (paid + approved/not-required) can
  check in. Pending-payment / pending-approval / rejected / canceled are rejected with a reason.
- **Flow**: staff pick an assigned event → search (name/email/code) → Check in → redeems the
  pretix position `secret` (the badge QR payload, stored on `AttendeeOrder.pretixSecret`) →
  **auto-prints a 4×6 badge** → reprint button. Duplicate check-ins are surfaced. Live counters
  come from pretix.
- **Badge (4×6 thermal)**: role TAG on top (color per `media/partner/staff/speaker/visitor`),
  Full Name, Company, QR. `@page { size: 4in 6in }` print CSS. Role tag derived at registration
  from `EventMapping.itemTagMap` (pretix item → tag).
- **Permissions**: check-in staff limited to `assignedEventIds`; organizer/super admin wider;
  finance/other roles cannot; impersonating blocked; cross-org denied.
- **pretixSCAN**: configure a device against the organizer + check-in list using the API token;
  it scans the same QR. **Webhook**: pretix → `POST /api/webhooks/pretix?secret=$PRETIX_WEBHOOK_SECRET`
  (shared-secret verified). Browser auto-print can't be server-triggered — printing happens in
  pretixSCAN or the staff station.

> Note: `/staff/badges` standalone reprint page deferred — reprint is available inline in the
> check-in station.

## Seat maps + waitlist (Milestone 9)

Optional per-event reserved seating and a waitlist for full events.

- **Seats** (custom layer = source of truth): enable via `EventMapping.seatSelectionEnabled`.
  States `available/temporarily_held/sold_or_reserved/blocked/accessible`. Selecting in the
  wizard holds seats for **10 minutes** (`heldUntil`); expired holds are released on read; on
  submit seats are held+confirmed (`sold_or_reserved`) against the order; released on cancel.
  GA events skip seat selection.
- **Waitlist**: enable via `EventMapping.waitlistEnabled`. When sold out, the event page shows
  **Join waitlist** (email) → `WaitlistEntry` with the next position. Admins promote from
  `/<locale>/admin/events/[id]/waitlist` (sends a "spot opened" email, audited). Promotion is
  manual (auto deferred); organizer/super admin only, impersonating blocked, cross-org denied.

## External API + webhooks (Milestone 10)

Versioned `/api/v1` for organizers/integrations. Full spec: `docs/api/openapi.yaml`.

### Authentication
`Authorization: Bearer sk_strawberry_xxxx`. Keys are **organization-scoped** (optionally
event-restricted). Only a SHA-256 **hash** is stored — the raw key is shown **once** at
creation. Manage at `/<locale>/admin/settings/api-keys` (super/organizer admin only;
finance, check-in staff, and impersonating users cannot; cross-org denied).

### Scopes
`events:read, attendees:read, attendees:write, orders:read, checkins:read, checkins:write,
waitlist:read, waitlist:write, seats:read, webhooks:manage`. Missing scope → `403 forbidden_scope`.

### Rate limits
Per-key fixed window (default 120/min) → `429 rate_limited` + `Retry-After` / `X-RateLimit-*`.
(In-memory, single-instance — swap for Redis to scale horizontally.)

### Responses
`{ data, meta, error: null }` on success; `{ data: null, meta: {}, error: { code, message } }`
on error. Lists include `meta.pagination`. **DELETE is never supported** (no destructive
endpoints) → `405 method_not_allowed`.

### Endpoints
`GET /me`, `GET /events`, `GET /events/:id`, `GET /events/:id/{attendees|orders|checkins|waitlist|seats}`,
`POST /events/:id/{waitlist|attendees|checkins}`. Never leaks pretix tokens, secrets,
`pretixSecret`, or magic links.

### Webhooks
Configure endpoints at `/<locale>/admin/settings/webhooks` (create, enable/disable, rotate
secret, test, recent deliveries). Events: `attendee.created/approved/rejected`,
`order.created/paid`, `ticket.issued`, `checkin.created`, `badge.printed`,
`waitlist.joined/promoted`, `seat.held/confirmed/released`.
Delivery is **non-blocking** (never breaks the primary action), recorded in
`WebhookDelivery`, retried with backoff. Each request is signed:
`X-Strawberry-Signature = HMAC-SHA256(secret, "${timestamp}.${rawBody}")` (hex), plus
`X-Strawberry-Timestamp`, `X-Strawberry-Delivery`, `X-Strawberry-Event`. Verify by
recomputing the HMAC and constant-time comparing.

## Integrations, audit & archive (Milestone 11)

### Integration settings
`/<locale>/admin/settings/integrations` hub + sub-pages: `smtp`, `whatsapp`, `sms`,
`whish-placeholder`, `pretix`. All secrets (SMTP password, WhatsApp/SMS/Whish tokens,
pretix token) are **encrypted at rest (AES-256-GCM)** and **never returned/displayed**
after saving — the UI shows only a `configured` flag, last-tested time, and last error.
- **SMTP**: host/port/username/password/from/reply-to/encryption + test send. In
  non-production, missing SMTP falls back to the dev-log transport.
- **WhatsApp / SMS / Whish**: clean provider interfaces (`lib/notify/*`, `lib/payments/whish.ts`)
  as placeholders — config + secrets stored encrypted; live sending/charging is deferred.
- **pretix**: per-org base URL / organizer slug / encrypted token (env `PRETIX_API_TOKEN`
  is the fallback; raw token never shown).
- **Permissions**: super + organizer_admin edit; finance may **view** status but not edit
  secrets; check-in staff cannot; impersonating users cannot modify. Cross-org denied.

### Audit log
`/<locale>/admin/audit` — filter by action, entity type, success/failure, impersonation;
detail view shows actor, impersonated user, org/event, before/after, IP/UA, result. All
audit access is org-isolated (super sees all). Central writer: `lib/audit/service.record`.

### Archive / delete queue (14-day retention)
No user-facing hard delete; **HTTP DELETE stays 405**. Records are soft-archived
(`ArchiveQueue`, snapshot + `purgeAfter = now + 14d`), recoverable via
`/<locale>/admin/delete-queue` (restore / cancel purge / purge now). After 14 days the
`cleanup()` service marks them purged and clears the **local snapshot only** — pretix
orders are **never destructively deleted** (prefer cancel/status changes). Finance cannot
purge; check-in staff cannot archive/delete; impersonating users cannot; cross-org denied.
Cleanup is an admin-invoked service today; schedule via cron (no self-scheduling runner yet).

### Reminders (foundation)
`ReminderSetting` models per-org/event channel toggles (email/WhatsApp/SMS) and offsets
(default 24h + 1h before). Scheduling/sending is wired in a later milestone.

## Production hardening (Milestone 12)

### Security headers
Applied to every route via `next.config.ts` `headers()` (`lib/security/headers.ts`):
- **Content-Security-Policy**: `default-src 'self'`; `img-src 'self' data: blob:`;
  `style-src 'self' 'unsafe-inline'` (Tailwind/inline styles);
  `script-src 'self' 'unsafe-inline'` (Next hydration). `'unsafe-eval'` is added **only in
  development** (React dev uses `eval`); production stays strict. `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. A nonce-based strict CSP is
  a documented future refinement.
- **Strict-Transport-Security** (production only): `max-age=63072000; includeSubDomains; preload`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-DNS-Prefetch-Control: off`.
- `poweredByHeader: false` removes `X-Powered-By`.

### Cookies / transport
Auth.js sets `httpOnly` + `sameSite`; `useSecureCookies` is enabled in production
(`__Secure-` prefix + `Secure`). The theme cookie is non-sensitive (`sameSite=lax`).

### Rate limiting (`lib/security/rate-limit.ts`)
In-memory fixed-window limiter (`rateLimit(key, limit, windowMs)`), single-instance —
**defense-in-depth; also rate-limit at the edge/CDN/nginx, and swap for Redis to scale
horizontally**:
- **Public registration**: 10 / min per client IP (`x-forwarded-for`/`x-real-ip`).
- **Login** (credentials `authorize`): 5 attempts / 5 min per email (generic reject, no
  account enumeration).
- **External API**: per-key limits (Milestone 10).

## Production deployment & TLS (required)

> **Do not run public production over plain HTTP.** Secure cookies require HTTPS at the
> browser, and the HSTS header the app emits in production is meaningless without HTTPS
> termination. Local development may remain HTTP. The bundled `docker/nginx.conf` listens
> on **port 80 only** — you must terminate TLS using one of the two options below.

**Startup safety:** in production the app **fails fast at startup** if required secrets are
missing, empty, weak, or placeholders (`apps/web/src/lib/config/env.ts`, wired via
`instrumentation.ts`) — it refuses to boot on `change_me`/`dev-secret`/empty values. (Compose
keeps dev-friendly fallbacks so `docker compose` parses without a root `.env` in development;
the app-level validator is the authoritative production guard.) Copy
`.env.production.example` → `.env` and fill strong values; **rotate any dev pretix token /
`ENCRYPTION_KEY`** before go-live (see that file's rotation notes — losing `ENCRYPTION_KEY`
makes stored integration secrets unrecoverable).

**Health checks:** `GET /api/health` (liveness), `/api/health/db` (DB), `/api/health/ready`
(config + DB → 200/503). Point your uptime monitor at `/api/health/ready`.

### Option A — Cloudflare terminates TLS (recommended)
- Proxy the DNS record through Cloudflare (orange cloud); SSL/TLS mode **Full (strict)**.
- Restrict the origin so it only accepts Cloudflare (firewall to Cloudflare IP ranges, or
  Cloudflare Tunnel / Authenticated Origin Pulls).
- Browser-facing traffic is HTTPS, so secure cookies + HSTS work. Origin may speak HTTP to
  Cloudflare **only** because the public hop is HTTPS and the origin is locked down.
- Configure nginx `set_real_ip_from` for Cloudflare ranges so the IP-keyed rate limits and
  audit IPs reflect the real client, not Cloudflare.

### Option B — nginx terminates TLS directly
- Add a `listen 443 ssl;` server block with a valid certificate (e.g. certbot / Let's Encrypt).
- Redirect all HTTP → HTTPS (`return 301 https://$host$request_uri;` on the port-80 server).
- Secure cookies and HSTS then work end-to-end.
- Consider nginx `limit_req` zones for `/api/auth` and registration as edge defense-in-depth
  (the app limiter is in-memory/single-instance).

### Cron (manual today)
Archive purge (`cleanup()`, 14-day retention) and webhook retry (`retryDue()`) are
admin-invoked services — schedule them via host cron / systemd timer / container sidecar.
Waitlist promotion is manual.

## Notes / decisions

- **ORM:** Prisma (relational integrity, migration tooling).
- **Auth:** credentials + argon2id; JWT sessions (Auth.js requires JWT for the
  credentials provider — DB sessions are not supported there).
- **pretix config:** the standalone image is configured via `PRETIX_*` env vars in
  `compose.yaml` (no mounted `pretix.cfg`, to avoid env/file conflicts).
- **Prisma location:** `apps/web/prisma` (not repo root) for clean client resolution
  and Docker build context.
- **Backups:** `scripts/backup.sh` / `scripts/restore.sh` (app DB, pretix DB, pretix
  data volume).
