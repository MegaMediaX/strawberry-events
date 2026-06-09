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
