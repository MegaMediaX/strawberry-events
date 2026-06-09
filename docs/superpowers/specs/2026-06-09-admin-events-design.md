# Milestone 4 — Admin Events + Tickets (with org isolation) Design

**Date:** 2026-06-09
**Status:** Approved (design); spec for review
**Depends on:** M1 (Foundation), M2 (pretix adapter). Folds the planned M3 org-isolation
enforcement into this milestone, since isolation is best built into the admin queries.

---

## 1. Goal

Admin CRUD for events, ticket items, and quotas — built on the M2 pretix adapter, with
multi-organizer isolation enforced in every query and per-organizer pretix credentials.

In scope: event list (table/cards toggle), event create/edit (tabbed form), per-event
tickets + quotas, org switcher for super admins, per-org pretix token resolution, audit
logging of admin mutations.

Out of scope: sessions/workshops, approvals, seating, coupons/vouchers, public
registration, finance — each its own later milestone.

## 2. Routes

Under `src/app/[locale]/(admin)/admin`, all gated by `requireRole(["super_admin","organizer_admin"])`:

- `/admin/events` — list, table/cards view toggle persisted per user (localStorage).
- `/admin/events/new` — create (tabbed form).
- `/admin/events/[id]/edit` — edit; `[id]` = local `EventMapping.id`.
- `/admin/events/[id]/tickets` — items + quotas.

## 3. Org context & isolation

- `lib/auth/active-org.ts`:
  - `getActiveOrg(session)` → resolves the `Organization`. org_admin: their org. super_admin:
    org id from a signed cookie `active_org`, validated against existence; default to first org.
  - `setActiveOrg(orgId)` server action (super admin only).
- Every event query is built with `scopeWhere(session)` on `EventMapping.organizationId`;
  single-event loads also assert `canAccessEvent`. A thin `lib/events/service.ts` centralizes
  this so no route queries `EventMapping` directly without scoping.
- `OrganizerSwitcher` component (super admin only) in the admin header.

## 4. pretix credential resolution

- New column `Organization.pretixApiToken String?` storing an **encrypted** token.
- `lib/crypto.ts`: AES-256-GCM `encrypt`/`decrypt` using `ENCRYPTION_KEY` env (32-byte base64).
- `lib/pretix/context.ts`: `resolvePretixContext(org)` → `{ organizerSlug, token }`. Uses the
  org's decrypted token if set, else falls back to env `PRETIX_API_TOKEN` (dev).
- **Adapter refactor:** `pretixFetch`/`pretixFetchAll` and resource functions accept an optional
  explicit token (falling back to env), so per-org credentials work. Backward compatible — M2
  unit tests still pass (env path unchanged when no token passed).

## 5. Data flow

Create event:
```
form submit (Server Action)
 → getActiveOrg(session) + resolvePretixContext(org)
 → pretix.createEvent(slug, {titleEn/ar, date_from, currency:"USD", ...}, token)
 → prisma.eventMapping.create({ org_id, pretixOrganizerSlug, pretixEventSlug,
      titleEn/Ar, descriptionEn/Ar, visibility, accountMode, approvalMode, comingSoon })
 → auditLog(event.created)
```
Edit: PATCH pretix + update EventMapping + audit. Tickets: `createItem` then `createQuota`
(item needs a quota to sell), recorded in `PretixObjectMapping`, with item↔quota linkage; audit.

**Partial-failure rule:** if the pretix call succeeds but the local DB write fails, best-effort
roll back the pretix object (cancel/delete) and surface an error. No orphaned mappings.

## 6. Components

`AdminShell` (sidebar + header), `OrganizerSwitcher`, `EventList` + `ViewToggle`,
`EventForm` (tabs: Details / Schedule & Location / Registration / Tickets) using
react-hook-form + zod, `TicketBuilder` (item rows + quota). Mutations via **Server Actions**
co-located with the routes (no `/api/admin` REST this milestone).

## 7. Error handling

- `PretixValidationError.fieldErrors` mapped to per-field form errors.
- Zod validation client + server.
- Partial-failure rollback per §5.
- Forbidden (cross-org) → 404/redirect, never leak existence.

## 8. Testing

- Unit (offline): `getActiveOrg` (org_admin vs super_admin vs cookie), `resolvePretixContext`
  (per-org token vs env fallback), `crypto` round-trip, event service scope enforcement
  (cross-org denied), partial-failure rollback path (mocked adapter throws on DB write).
- Integration (mocked pretix + throwaway Postgres): create-event service writes EventMapping +
  audit; tickets create item+quota+mappings.
- `npm test` stays offline; `npm run typecheck` + `npm run build` pass.

## 9. Acceptance Criteria

1. Super admin can switch orgs (header); org_admin locked to their org.
2. Creating an event creates it in pretix AND a scoped EventMapping + audit log.
3. Listing/editing events never returns another org's events (scope enforced + tested).
4. Per-org pretix token used when set; env fallback otherwise.
5. Tickets create pretix item + quota and are sellable (quota present).
6. Event list toggles table/cards, persisted.
7. Partial-failure rollback leaves no orphaned mapping.
8. `npm test` / `typecheck` / `build` green.

## 10. Migrations

Add `Organization.pretixApiToken String?` (encrypted at rest) and `ENCRYPTION_KEY` to
`.env.example`. New Prisma migration.
