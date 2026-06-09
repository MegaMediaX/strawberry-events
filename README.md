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
