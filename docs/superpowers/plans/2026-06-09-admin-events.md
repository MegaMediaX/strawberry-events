# Admin Events + Tickets (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin CRUD for events, ticket items, and quotas on the pretix adapter, with multi-organizer isolation enforced in every query and per-organizer pretix credentials.

**Architecture:** Server Components for admin pages + Server Actions for mutations. A thin `events` service centralizes org-scoped DB access (`scopeWhere`/`canAccessEvent`) and orchestrates pretix adapter calls + local EventMapping/PretixObjectMapping writes + audit logs. Active org resolved from membership (org_admin) or a signed cookie (super admin). pretix token resolved per-org (encrypted column) with env fallback.

**Tech Stack:** Next.js 16 App Router (Server Actions), TypeScript, Prisma, react-hook-form + zod, shadcn/ui, Vitest, Node crypto (AES-256-GCM).

Spec: `docs/superpowers/specs/2026-06-09-admin-events-design.md`

---

## File Structure

```
apps/web/src/
  lib/
    crypto.ts                      # NEW AES-256-GCM encrypt/decrypt
    auth/active-org.ts             # NEW getActiveOrg / setActiveOrg
    pretix/context.ts              # NEW resolvePretixContext(org)
    pretix/client.ts               # MODIFY: optional explicit token
    pretix/{events,products,...}.ts# MODIFY: thread optional token param
    events/service.ts              # NEW org-scoped event/ticket service
    events/schema.ts               # NEW zod schemas (event, ticket)
  app/[locale]/(admin)/admin/
    layout.tsx                     # NEW AdminShell (sidebar + header)
    events/page.tsx                # list (server component)
    events/event-list.tsx          # client: table/cards + ViewToggle
    events/new/page.tsx            # create
    events/[id]/edit/page.tsx      # edit
    events/[id]/tickets/page.tsx   # tickets + quotas
    events/event-form.tsx          # client tabbed form (Server Action submit)
    events/ticket-builder.tsx      # client item+quota rows
    events/actions.ts              # "use server" create/update/createTicket
    _components/organizer-switcher.tsx
  prisma/schema.prisma             # MODIFY: Organization.pretixApiToken
```

DRY: all EventMapping access flows through `events/service.ts`. YAGNI: no REST routes, no sessions/approvals/seating.

---

## Chunk 1: crypto + schema + pretix token threading

### Task 1: AES-256-GCM crypto helper
**Files:** Create `src/lib/crypto.ts`, `src/lib/__tests__/crypto.test.ts`.
- [ ] Step 1: Write failing test: `decrypt(encrypt("tok_secret"))==="tok_secret"`; two encryptions of same input differ (random IV); `decrypt` of tampered string throws. Set `process.env.ENCRYPTION_KEY` to a base64 32-byte key in the test.
- [ ] Step 2: `npx vitest run crypto` → FAIL.
- [ ] Step 3: Implement using `node:crypto` `createCipheriv("aes-256-gcm", key, iv)`; output `base64(iv).base64(tag).base64(ciphertext)`; key from `ENCRYPTION_KEY` (base64, 32 bytes).
- [ ] Step 4: `npx vitest run crypto` → PASS.
- [ ] Step 5: Commit `feat: AES-256-GCM crypto helper`.

### Task 2: Organization.pretixApiToken + migration
**Files:** Modify `prisma/schema.prisma`; add `ENCRYPTION_KEY` to `.env.example`.
- [ ] Step 1: Add `pretixApiToken String?` to `Organization`.
- [ ] Step 2: `npx prisma validate` → PASS; generate migration via throwaway PG (see Task 11 pattern) named `add_org_pretix_token`. (Migration SQL committed; applied during verify.)
- [ ] Step 3: Add `ENCRYPTION_KEY=` to `.env.example` with a comment (base64 32 bytes).
- [ ] Step 4: Commit `feat: org pretixApiToken column + ENCRYPTION_KEY`.

### Task 3: Thread optional token through the adapter
**Files:** Modify `src/lib/pretix/client.ts`, `events.ts`, `products.ts`, `orders.ts`, `checkin.ts`; modify `__tests__/client.test.ts`.
- [ ] Step 1: Write failing test: `pretixFetch("/x/", {}, "explicit_tok")` sends `Authorization: Token explicit_tok` (overriding env).
- [ ] Step 2: Run `npx vitest run client` → FAIL.
- [ ] Step 3: Add optional `token?: string` arg to `pretixFetch`/`pretixFetchAll` (and an internal pass-through); resource functions gain a trailing optional `token?` param forwarded to the client. Env remains the fallback when omitted (M2 tests unchanged).
- [ ] Step 4: Run `npx vitest run pretix` → PASS (all existing + new).
- [ ] Step 5: Commit `feat(pretix): optional per-call API token`.

---

## Chunk 2: org context + pretix context

### Task 4: resolvePretixContext
**Files:** Create `src/lib/pretix/context.ts`, `__tests__/context.test.ts`.
- [ ] Step 1: Write failing test: given an org with encrypted `pretixApiToken`, returns `{organizerSlug, token}` with decrypted token; given null token, returns env `PRETIX_API_TOKEN`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement using `crypto.decrypt` + `mappers`-free simple object; pull slug from `org.pretixOrganizerSlug`.
- [ ] Step 4: Run → PASS. Commit `feat(pretix): per-org credential resolution`.

### Task 5: active org resolution
**Files:** Create `src/lib/auth/active-org.ts`, `__tests__/active-org.test.ts`.
- [ ] Step 1: Write failing tests for a pure `chooseActiveOrgId(memberships, isSuperAdmin, cookieOrgId, allOrgIds)`:
  - org_admin → their org id (ignores cookie).
  - super_admin + valid cookie → cookie org.
  - super_admin + invalid/absent cookie → first org id.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement the pure chooser. (The server wrapper `getActiveOrg` that reads cookies + DB is thin and covered by integration later.)
- [ ] Step 4: Run → PASS. Commit `feat(auth): active org chooser (tested)`.

### Task 6: getActiveOrg / setActiveOrg server wrappers
**Files:** Append to `src/lib/auth/active-org.ts`.
- [ ] Step 1: Implement `getActiveOrg(session)` (reads `active_org` cookie via `next/headers`, loads candidate orgs scoped to memberships, calls `chooseActiveOrgId`, returns the `Organization`). `setActiveOrg(orgId)` ("use server") sets a signed/httpOnly cookie after asserting super_admin + membership/existence.
- [ ] Step 2: `npx tsc --noEmit` → PASS (no unit test; covered in integration).
- [ ] Step 3: Commit `feat(auth): getActiveOrg/setActiveOrg`.

---

## Chunk 3: events service (the isolation core)

### Task 7: event zod schemas
**Files:** Create `src/lib/events/schema.ts`, `__tests__/schema.test.ts`.
- [ ] Step 1: Write failing tests: `eventInputSchema` requires titleEn, slug, dateFrom; rejects bad slug; ticketInputSchema requires titleEn, priceCents>=0, quotaSize nullable.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement zod schemas.
- [ ] Step 4: Run → PASS. Commit `feat(events): zod schemas`.

### Task 8: event service — create/list/get with scope
**Files:** Create `src/lib/events/service.ts`, `__tests__/service.test.ts`.
- [ ] Step 1: Write failing tests (mock `prisma` + pretix adapter + audit):
  - `listEventsForSession` applies `scopeWhere` (asserts the `where` passed to prisma includes org filter for non-super; empty for super).
  - `getEventForSession` throws/ô returns null when `canAccessEvent` false (cross-org denied).
  - `createEvent` calls `pretix.createEvent` then `prisma.eventMapping.create` with org id + audit; on DB-write throw, calls a rollback (`pretix.cancel`/delete) — assert rollback invoked.
- [ ] Step 2: Run `npx vitest run events/service` → FAIL.
- [ ] Step 3: Implement service functions; inject prisma/adapter/audit via module imports (mock with `vi.mock`). Centralize scoping here.
- [ ] Step 4: Run → PASS. Commit `feat(events): org-scoped event service + rollback`.

### Task 9: ticket service — item + quota
**Files:** Modify `src/lib/events/service.ts`; modify `__tests__/service.test.ts`.
- [ ] Step 1: Write failing test: `createTicket(session, eventId, input)` resolves event (scoped), calls `pretix.createItem` then `pretix.createQuota([item.id])`, records `PretixObjectMapping` rows + audit.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → PASS. Commit `feat(events): ticket (item+quota) service`.

---

## Chunk 4: admin UI

### Task 10: AdminShell + OrganizerSwitcher
**Files:** Create `admin/layout.tsx`, `_components/organizer-switcher.tsx`.
- [ ] Step 1: `layout.tsx` server component: `requireRole(["super_admin","organizer_admin"])`, renders sidebar (Dashboard/Events/Registrations/Finance/Staff/Settings) + header (OrganizerSwitcher for super admin, language toggle).
- [ ] Step 2: `OrganizerSwitcher` client component posting to `setActiveOrg`.
- [ ] Step 3: `npm run build` → PASS. Commit `feat(admin): shell + organizer switcher`.

### Task 11: Event list + view toggle
**Files:** Create `admin/events/page.tsx`, `admin/events/event-list.tsx`.
- [ ] Step 1: `page.tsx` server: `getActiveOrg`, `listEventsForSession`, pass to client list.
- [ ] Step 2: `event-list.tsx` client: table/cards views + `ViewToggle` persisting choice in `localStorage`.
- [ ] Step 3: `npm run build` → PASS. Commit `feat(admin): event list with view toggle`.

### Task 12: Event form + create/edit + actions
**Files:** Create `admin/events/actions.ts`, `event-form.tsx`, `events/new/page.tsx`, `events/[id]/edit/page.tsx`.
- [ ] Step 1: `actions.ts` ("use server"): `createEventAction`/`updateEventAction` — parse with zod, call service, `revalidatePath`, redirect; map `PretixValidationError.fieldErrors` to a returned error shape.
- [ ] Step 2: `event-form.tsx` client tabbed form (Details/Schedule+Location/Registration/Tickets) via react-hook-form; submit to action.
- [ ] Step 3: `new/page.tsx` renders empty form; `[id]/edit/page.tsx` loads via `getEventForSession` (404 if cross-org) and prefills.
- [ ] Step 4: `npm run build` → PASS. Commit `feat(admin): event create/edit form + actions`.

### Task 13: Tickets page + builder
**Files:** Create `admin/events/[id]/tickets/page.tsx`, `ticket-builder.tsx`; extend `actions.ts`.
- [ ] Step 1: `createTicketAction` calls `createTicket` service.
- [ ] Step 2: `tickets/page.tsx` lists items for the event (scoped); `ticket-builder.tsx` adds item (title EN/AR, price, quota size).
- [ ] Step 3: `npm run build` → PASS. Commit `feat(admin): tickets + quota builder`.

---

## Chunk 5: integration verify

### Task 14: Integration — scope + create against throwaway Postgres
**Files:** Create `src/lib/events/__tests__/service.integration.test.ts` (env-gated like the pretix live suite: runs when `TEST_DATABASE_URL` set).
- [ ] Step 1: With a throwaway Postgres + migrations applied + pretix adapter mocked, assert: createEvent writes a scoped EventMapping + audit row; a second org's session cannot list/get it.
- [ ] Step 2: Confirm it SKIPS without `TEST_DATABASE_URL`. Commit `test(events): integration scope/create suite`.

### Task 15: Full verify
- [ ] Step 1: Throwaway Postgres on :5433; `prisma migrate deploy` (applies new migration) + seed.
- [ ] Step 2: `TEST_DATABASE_URL=... npx vitest run` → integration green; plain `npx vitest run` offline green.
- [ ] Step 3: `npm run typecheck` + `npm run build` green.
- [ ] Step 4: Manual: run app, log in as seeded super admin, create an event (mock or live pretix), confirm it appears in the list and not for another org.
- [ ] Step 5: Commit `chore(admin): M4 verified` + update README.

---

## Notes
- DRY: single `events/service.ts` owns scoping. YAGNI: Server Actions not REST; no sessions/approvals/seating/vouchers.
- TDD on logic-bearing units (crypto, context, active-org chooser, schemas, service). UI verified by build + manual + integration.
- Reference: @superpowers:test-driven-development, @superpowers:verification-before-completion.
