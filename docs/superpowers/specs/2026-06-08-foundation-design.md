# Strawberry Events Platform — Foundation (Milestone 1) Design

**Date:** 2026-06-08
**Status:** Draft for approval
**Scope:** Milestone 1 only. The full platform is decomposed into ~12 sub-projects (see Appendix A); this spec covers the runnable foundation that every later milestone builds on.

---

## 1. Goal

Deliver a runnable, Dockerized skeleton of the Strawberry Events Platform that:

- boots all backing services with one `docker compose up`,
- serves a Next.js 16 App Router app with the design-system baseline,
- supports English + Arabic with RTL switching,
- authenticates users with role-based access control and organizer isolation primitives,
- has the full custom-layer database schema migrated,
- exposes a typed pretix adapter **skeleton** (interfaces + authenticated client, no business logic).

Milestone 1 is the foundation only. It deliberately does NOT implement registration, admin CRUD, payments, badges, or check-in.

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| ORM | **Prisma** | ~20 relational tables with heavy integrity; superior migration tooling & relational ergonomics; VPS (not edge) target. |
| Auth | **Auth.js (NextAuth) Credentials + roles** | Self-hosted, no external IdP, email/password. Sessions in app DB. RBAC via `organization_members`. |
| Databases | **Two Postgres instances** (app + pretix) | pretix owns its DB; independent backups; clean source-of-truth boundary. |
| pretix | **Self-hosted via Compose**, assumed not to exist yet | Spec requires self-hosted open-source pretix as core engine. |
| Credentials | **Placeholders / TODOs** (SMTP, Whish, domain) | None available yet; local dev defaults only. |

## 3. Service Topology

```
Cloudflare (prod only)
  └─ nginx (reverse proxy)
       ├─ next-app        Next.js 16 + TS  (the only Node app)
       └─ pretix          self-hosted pretix
                            ├─ postgres-pretix
                            └─ redis (shared)
   next-app ─ postgres-app (custom layer)
   next-app ─ redis        (cache / rate limiting / seat holds later)
```

Compose services: `next-app`, `pretix`, `postgres-app`, `postgres-pretix`, `redis`, `nginx`.
Each service has a healthcheck; `next-app` depends on `postgres-app` healthy; `pretix` depends on `postgres-pretix` + `redis` healthy.

## 4. Repository Structure

```
strawberry-events/
  apps/web/
    src/
      app/                 # App Router; [locale] segment for i18n
        [locale]/
          (public)/        # placeholder landing
          (auth)/login/    # credentials login
          (admin)/admin/   # gated placeholder dashboard
      lib/
        auth/              # Auth.js config, requireRole, org-isolation guard
        db/                # Prisma client singleton
        i18n/              # locale config, dictionaries, RTL helper
        pretix/            # adapter skeleton (interfaces + client)
      components/ui/        # shadcn baseline
      messages/            # en.json, ar.json
  prisma/
    schema.prisma
    seed.ts
  docker/
    nginx.conf
    pretix/pretix.cfg
  scripts/
    backup.sh
    restore.sh
  compose.yaml
  .env.example
  README.md
```

## 5. Database Schema (custom layer)

Prisma models for M1 (full set, even where later milestones populate them, so migrations are stable early):

`organizations`, `organization_members` (role enum: super_admin | organizer_admin | checkin_staff | finance), `user_profiles`, `event_mappings`, `pretix_object_mappings`, `seat_maps`, `seat_sections`, `seat_rows`, `seat_assignments`, `badge_templates`, `badge_print_logs`, `approval_rules`, `approval_requests`, `custom_form_fields`, `custom_form_answers`, `integration_settings`, `smtp_settings`, `api_keys`, `webhooks`, `webhook_deliveries`, `audit_logs`, `archive_queue`.

Plus Auth.js tables (`User`, `Account`, `Session`, `VerificationToken`).

Field definitions follow the prompt's section 13 verbatim, with: bilingual `_en`/`_ar` columns where the prompt requires them; all money in USD integer cents; `created_at`/`updated_at` on every table.

**Isolation invariant:** every org-scoped table carries `organization_id`; the query guard (§6) injects it. No raw cross-org query is permitted outside the guard.

## 6. Auth & RBAC

- Auth.js Credentials provider; passwords hashed with `argon2` (or bcrypt) — pepper from `API_KEY_PEPPER` is for API keys, not user passwords (separate). Decision: **argon2id** for user passwords.
- Session strategy: database sessions.
- Roles resolved from `organization_members` for the active organization.
- Utilities:
  - `getSession()` — typed session accessor.
  - `requireRole(roles[])` — server-side guard, throws/redirects.
  - `withOrgScope(session)` — returns a Prisma extension/helper that constrains queries to the user's organization(s); super_admin bypasses.
- `OrganizerSwitcher` (super admin) deferred to admin milestone; the primitive is built now.

## 7. i18n & RTL

- `next-intl` with a `[locale]` route segment (`en` default, `ar`).
- `dir="rtl"` + logical CSS properties; Tailwind v4 logical utilities. A sample page demonstrates a working switch.
- Dictionaries: `messages/en.json`, `messages/ar.json`. Bilingual *content* (events, etc.) lives in DB `_en`/`_ar` columns, not in dictionaries — dictionaries are UI chrome only.

## 8. pretix Adapter Skeleton

`src/lib/pretix/` files: `client.ts` (auth, base fetch, error mapping), `errors.ts`, and **typed interface stubs** for `events.ts`, `orders.ts`, `products.ts`, `checkin.ts`, `vouchers.ts`, `questions.ts`, `webhooks.ts`. Each exports typed function signatures that throw `NotImplemented` in M1. Organizer slug is always resolved from `event_mappings`/`organizations` — never a global constant in app code. `PRETIX_DEFAULT_ORGANIZER` is dev-seed only.

## 9. Seed

`seed.ts` creates: one organization (`strawberry`), one super_admin user (credentials from env), and the dev `event_mappings.pretix_organizer_slug = strawberry`.

## 10. Acceptance Criteria (M1)

1. `docker compose up` brings all 6 services to healthy.
2. `prisma migrate` applies the full schema to `postgres-app`.
3. Visiting `/en` and `/ar` renders the sample page; Arabic is RTL.
4. Super admin can log in via credentials; a non-admin cannot reach `/admin`.
5. `requireRole` and `withOrgScope` are unit-tested (happy + denial paths).
6. pretix container is reachable; adapter `client.ts` can authenticate against it (smoke test), other adapter fns throw `NotImplemented`.
7. `.env.example` documents every variable from prompt §22.

## 11. Testing

- Unit: auth guards, org-scope helper, i18n RTL helper.
- Integration: Prisma migrate + seed against ephemeral Postgres; pretix client auth smoke test.
- No E2E in M1.

## 12. Out of Scope (deferred to later milestones)

Registration flow, admin/event/ticket CRUD, sessions/seat selection logic, payments/COD lifecycle, approval workflows, finance, staff check-in, badge printing, external API/keys/webhooks runtime, integrations beyond settings tables, archive/purge job, backups automation, Cloudflare config hardening.

---

## Appendix A — Full program decomposition (build order)

1. **Foundation** (this spec)
2. pretix adapter (real implementations)
3. Multi-organizer isolation enforcement end-to-end
4. Admin: events + tickets + sessions
5. Public registration flow (wizard, selectors)
6. Payments abstraction + COD lifecycle (+ Whish placeholder)
7. Approval + finance (mark-paid → email/QR)
8. Staff + check-in + 4×6 thermal badge station
9. Seat maps + waitlist
10. External API + keys + webhooks + rate limiting
11. Integrations (SMTP/WhatsApp/SMS), audit logs, archive/purge
12. Production hardening (backups, Cloudflare, error boundaries, tests)

Each item gets its own spec → plan → implementation cycle.
