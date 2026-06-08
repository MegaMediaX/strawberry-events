# Foundation (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable, Dockerized Next.js 16 skeleton with i18n/RTL, Auth.js credentials + RBAC, the full custom-layer Prisma schema, and a typed pretix adapter skeleton.

**Architecture:** Single Next.js App Router app (`apps/web`) talking to its own Postgres via Prisma. Self-hosted pretix runs in the same Compose project with its own Postgres + shared Redis, fronted by nginx. Auth.js Credentials provider with database sessions; roles live in `organization_members`; an org-scope guard constrains every query. pretix access goes only through a typed adapter whose functions throw `NotImplemented` in M1 except client auth.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, shadcn/ui, next-intl, Auth.js (NextAuth), Prisma, PostgreSQL, Redis, argon2, Docker Compose, nginx, Vitest.

Spec: `docs/superpowers/specs/2026-06-08-foundation-design.md`

---

## File Structure (locked)

```
compose.yaml                         # 6 services
.env.example                         # all §22 vars
docker/nginx.conf
docker/pretix/pretix.cfg
apps/web/
  Dockerfile
  package.json  tsconfig.json  next.config.ts  vitest.config.ts
  src/
    middleware.ts                    # locale routing
    i18n/routing.ts  i18n/request.ts
    messages/en.json  messages/ar.json
    lib/db/client.ts                 # Prisma singleton
    lib/auth/config.ts               # Auth.js options
    lib/auth/guards.ts               # requireRole, getSession
    lib/auth/org-scope.ts            # withOrgScope
    lib/auth/password.ts             # argon2 hash/verify
    lib/pretix/client.ts  errors.ts  events.ts orders.ts products.ts
                checkin.ts vouchers.ts questions.ts webhooks.ts
    app/[locale]/layout.tsx          # sets dir from locale
    app/[locale]/(public)/page.tsx   # sample i18n/RTL page
    app/[locale]/(auth)/login/page.tsx
    app/[locale]/(admin)/admin/page.tsx
    app/api/auth/[...nextauth]/route.ts
prisma/schema.prisma  prisma/seed.ts
scripts/backup.sh  scripts/restore.sh
```

---

## Chunk 1: Project scaffold & tooling

### Task 1: Initialize Next.js app
**Files:** Create `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` additions.
- [ ] Step 1: `cd apps/web && npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm` (accept App Router). If interactive prompts block, scaffold `package.json` manually with `next@^16 react react-dom typescript`.
- [ ] Step 2: Run `npm run build` → expect success on default app.
- [ ] Step 3: Add Vitest: `npm i -D vitest @vitejs/plugin-react` and create `vitest.config.ts`.
- [ ] Step 4: Add a trivial `src/lib/__tests__/smoke.test.ts` asserting `1+1===2`; run `npx vitest run` → PASS.
- [ ] Step 5: Commit `chore: scaffold next.js app + vitest`.

### Task 2: Tailwind v4 + shadcn baseline
**Files:** `apps/web/src/app/globals.css`, `components.json`, `src/components/ui/*`.
- [ ] Step 1: Confirm Tailwind v4 configured (CSS-first `@import "tailwindcss"`).
- [ ] Step 2: `npx shadcn@latest init` (neutral base, CSS variables). Add `button`, `input`, `card`.
- [ ] Step 3: `npm run build` → PASS.
- [ ] Step 4: Commit `chore: tailwind v4 + shadcn baseline`.

---

## Chunk 2: i18n & RTL

### Task 3: next-intl locale routing
**Files:** Create `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/middleware.ts`, `src/messages/en.json`, `src/messages/ar.json`; modify `next.config.ts`.
- [ ] Step 1: Write `src/lib/i18n/__tests__/dir.test.ts`:
```ts
import { dirForLocale } from "@/lib/i18n/dir";
test("ar is rtl, en is ltr", () => {
  expect(dirForLocale("ar")).toBe("rtl");
  expect(dirForLocale("en")).toBe("ltr");
});
```
- [ ] Step 2: `npx vitest run dir` → FAIL (module missing).
- [ ] Step 3: Create `src/lib/i18n/dir.ts`:
```ts
export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const dirForLocale = (l: string): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr");
```
- [ ] Step 4: `npx vitest run dir` → PASS.
- [ ] Step 5: Install `next-intl`; create routing/request configs + middleware matching `/(en|ar)/:path*` with `en` default.
- [ ] Step 6: `messages/en.json` `{ "home": { "title": "Strawberry Events" } }`; `ar.json` Arabic equivalent.
- [ ] Step 7: Commit `feat: next-intl locale routing + rtl helper`.

### Task 4: Locale layout + sample page
**Files:** Create `src/app/[locale]/layout.tsx`, `src/app/[locale]/(public)/page.tsx`.
- [ ] Step 1: `layout.tsx` sets `<html lang={locale} dir={dirForLocale(locale)}>` and wraps `NextIntlClientProvider`.
- [ ] Step 2: Sample page renders `t("home.title")` + a language switcher linking `/en` ↔ `/ar`.
- [ ] Step 3: `npm run build` → PASS. Manual: `/en` LTR, `/ar` RTL (verify in Chunk 6 compose run).
- [ ] Step 4: Commit `feat: locale layout + sample rtl page`.

---

## Chunk 3: Database schema

### Task 5: Prisma init + Auth.js + core models
**Files:** Create `prisma/schema.prisma`, `src/lib/db/client.ts`.
- [ ] Step 1: `npm i -D prisma && npm i @prisma/client && npx prisma init` (datasource = `DATABASE_URL`, provider postgres).
- [ ] Step 2: Add Auth.js models (`User`, `Account`, `Session`, `VerificationToken`) + enum `MemberRole { super_admin organizer_admin checkin_staff finance }`.
- [ ] Step 3: Add `organizations`, `organization_members`, `user_profiles`, `event_mappings`, `pretix_object_mappings` per spec §5 (bilingual `_en`/`_ar` where required, `organization_id` on org-scoped tables, timestamps, money as Int cents).
- [ ] Step 4: `src/lib/db/client.ts` Prisma singleton (global in dev).
- [ ] Step 5: `npx prisma validate` → PASS. Commit `feat: prisma schema core + auth models`.

### Task 6: Remaining custom tables
**Files:** Modify `prisma/schema.prisma`.
- [ ] Step 1: Add `seat_maps`, `seat_sections`, `seat_rows`, `seat_assignments`, `badge_templates`, `badge_print_logs`, `approval_rules`, `approval_requests`, `custom_form_fields`, `custom_form_answers`, `integration_settings`, `smtp_settings`, `api_keys`, `webhooks`, `webhook_deliveries`, `audit_logs`, `archive_queue` per spec §13.
- [ ] Step 2: `npx prisma validate` → PASS.
- [ ] Step 3: Commit `feat: prisma schema remaining custom tables`.

---

## Chunk 4: Auth & RBAC

### Task 7: Password hashing
**Files:** Create `src/lib/auth/password.ts`, test.
- [ ] Step 1: Write `password.test.ts`: `hash` then `verify` returns true; wrong password false.
- [ ] Step 2: `npx vitest run password` → FAIL.
- [ ] Step 3: `npm i argon2`; implement `hashPassword`/`verifyPassword` (argon2id).
- [ ] Step 4: `npx vitest run password` → PASS. Commit `feat: argon2id password hashing`.

### Task 8: Auth.js config + route
**Files:** Create `src/lib/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`.
- [ ] Step 1: `npm i next-auth@beta @auth/prisma-adapter`.
- [ ] Step 2: Credentials provider: look up `User` by email, `verifyPassword`, attach roles from `organization_members`; PrismaAdapter; database sessions.
- [ ] Step 3: Export handlers in route file.
- [ ] Step 4: `npm run build` → PASS. Commit `feat: auth.js credentials provider`.

### Task 9: Guards + org scope (TDD)
**Files:** Create `src/lib/auth/guards.ts`, `src/lib/auth/org-scope.ts`, tests.
- [ ] Step 1: Write `org-scope.test.ts`: `withOrgScope` for a non-super-admin injects `organization_id` filter; super_admin returns unfiltered. Use a fake session object.
- [ ] Step 2: `npx vitest run org-scope` → FAIL.
- [ ] Step 3: Implement `withOrgScope(session)` returning a `where`-merging helper; super_admin bypass.
- [ ] Step 4: Write `guards.test.ts`: `requireRole(["organizer_admin"])` throws/redirects for `finance`; passes for `organizer_admin`. Mock session accessor.
- [ ] Step 5: Implement `getSession`, `requireRole`. `npx vitest run guards org-scope` → PASS.
- [ ] Step 6: Commit `feat: rbac guards + org-scope helper (tested)`.

### Task 10: Login + gated admin pages
**Files:** Create `src/app/[locale]/(auth)/login/page.tsx`, `src/app/[locale]/(admin)/admin/page.tsx`.
- [ ] Step 1: Login form (react-hook-form + zod) posting to Auth.js credentials.
- [ ] Step 2: `admin/page.tsx` server component calls `requireRole(["super_admin","organizer_admin"])`, redirects to login otherwise.
- [ ] Step 3: `npm run build` → PASS. Commit `feat: login page + gated admin placeholder`.

---

## Chunk 5: pretix adapter skeleton

### Task 11: Client + errors + stubs
**Files:** Create `src/lib/pretix/{client,errors,events,orders,products,checkin,vouchers,questions,webhooks}.ts`, test.
- [ ] Step 1: Write `pretix-client.test.ts`: `pretixFetch` sets `Authorization: Token <token>` header and base URL from env (mock `fetch`).
- [ ] Step 2: `npx vitest run pretix-client` → FAIL.
- [ ] Step 3: `client.ts`: typed `pretixFetch(path, init)` reading `PRETIX_BASE_URL`/`PRETIX_API_TOKEN`, JSON + error mapping via `errors.ts` (`PretixError`, `NotImplemented`). Organizer slug param required on resource fns (never global).
- [ ] Step 4: Resource files export typed signatures that `throw new NotImplemented()`.
- [ ] Step 5: `npx vitest run pretix-client` → PASS. Commit `feat: pretix adapter skeleton`.

---

## Chunk 6: Docker, seed, env

### Task 12: Prisma seed
**Files:** Create `prisma/seed.ts`; modify `package.json` (`prisma.seed`).
- [ ] Step 1: Seed: upsert org `strawberry`, a super_admin `User` (email/password from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`), `organization_members` row, `event_mappings.pretix_organizer_slug=strawberry`.
- [ ] Step 2: Commit `feat: seed script`.

### Task 13: .env.example + Dockerfile
**Files:** Create `.env.example`, `apps/web/Dockerfile`.
- [ ] Step 1: `.env.example` with every var from prompt §22 plus `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `POSTGRES_*` for both DBs.
- [ ] Step 2: Multi-stage Dockerfile for `next-app` (deps → build → runner, standalone output).
- [ ] Step 3: Commit `chore: env example + web Dockerfile`.

### Task 14: Compose + nginx + pretix config
**Files:** Create `compose.yaml`, `docker/nginx.conf`, `docker/pretix/pretix.cfg`.
- [ ] Step 1: Services `postgres-app`, `postgres-pretix`, `redis`, `pretix` (`pretix/standalone` image), `next-app`, `nginx`. Healthchecks; `next-app` depends_on postgres-app healthy; pretix depends_on postgres-pretix + redis.
- [ ] Step 2: `pretix.cfg` points at postgres-pretix + redis; `nginx.conf` proxies `/` → next-app, `/pretix` → pretix.
- [ ] Step 3: `docker compose config` → valid. Commit `feat: docker compose + nginx + pretix config`.

### Task 15: End-to-end M1 verification
- [ ] Step 1: `docker compose up -d`; wait for all healthy (`docker compose ps`).
- [ ] Step 2: `docker compose exec next-app npx prisma migrate deploy && npx prisma db seed`.
- [ ] Step 3: Verify acceptance criteria spec §10: `/en` LTR, `/ar` RTL; login as seeded super_admin; non-admin blocked from `/admin`; pretix reachable; adapter smoke (client auth ok, others NotImplemented).
- [ ] Step 4: `npx vitest run` all green.
- [ ] Step 5: Commit `chore: M1 verified end-to-end` and update README with run instructions.

---

## Notes
- DRY / YAGNI: build only M1 surface; later-milestone tables exist but no logic.
- TDD on the logic-bearing units (password, guards, org-scope, pretix client). UI/config tasks verified by build + the §10 manual pass.
- Frequent commits after every task.
- Reference: @superpowers:test-driven-development, @superpowers:verification-before-completion.
