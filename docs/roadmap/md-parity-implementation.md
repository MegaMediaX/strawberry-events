# MD Parity — Implementation Roadmap

Branch: `feature/md-parity-missing-features`. Built in chunks (one logical commit per chunk), TDD on every permission boundary. See `docs/audits/feature-parity-matrix.md` for the gap analysis.

## Build order
| Chunk | Feature | Migration | New routes | Status |
|---|---|---|---|---|
| 1 | Feature parity report (this doc + matrix) | — | — | ✅ done |
| 2 | Staff walk-in registration | — | `/[locale]/(staff)/staff/events`, `/staff/registrations` | ✅ done |
| 3 | Admin dashboard KPIs + registrations table upgrade | — | (upgrades `/admin`, `/admin/registrations`) | ✅ done |
| 4 | User management | `User.status` enum | `/admin/users`, `/admin/users/[id]` | ✅ done |
| 5 | Email logs + resend | `EmailLog` model | `/admin/emails`, `/admin/emails/[id]` | ✅ done |
| 6 | Modular form fields per ticket | `CustomFormField.placeholderEn/Ar` | (admin event/ticket UI + wizard) | ✅ done |
| 7 | Maps / location | `EventMapping` location cols | (event create/edit + public detail) | ✅ done |
| 8 | Calendar polish | — | `/[locale]/(public)/events/[slug]/calendar.ics` (route handler) | ✅ done |
| 9 | Attendee portal | `PasswordResetToken` | `/register`, `/forgot-password`, `/reset-password`, `/my-registrations`, `/profile` | ✅ done |
| 10 | Arabic UI pass (i18n externalization + RTL) | — | — | ⏸️ deferred (see note) |
| 11 | Final validation + PR description | — | — | ✅ done |

> Ordering note vs. the brief: the Arabic pass was scheduled **last** so it externalizes strings introduced by chunks 2–9 in one sweep, rather than retrofitting each.

## Final validation (Chunk 11 — 2026-06-11)
Full gate green on `feature/md-parity-missing-features`:
- `tsc --noEmit` → **0 errors** · `lint` → **0** · `test` → **447 passing / 36 skipped** (skips are DB-gated live-integration tests with no `TEST_DATABASE_URL`) · `smoke` → **pass** · `next build` → **success** (all new routes compiled).
- `npm audit` → 7 advisories (2 low, 5 moderate), all pre-existing transitive deps — none introduced by this PR; not auto-fixed (`--force` is breaking). Tracked separately.

> **Chunk 10 (full Arabic UI pass) deferred — PM decision 2026-06-11.** A parallel "frontend premium" restyle is actively rewriting the exact public/admin JSX a string-externalization sweep must touch; doing both concurrently is double-work. The platform is already bilingual at the data layer (event titles/descriptions en/ar), in transactional email templates (en/ar), and in locale routing + RTL `dir`. Remaining work is UI-chrome strings only → scheduled as a follow-up PR once the restyle lands.

## Migrations (all additive)
1. `User.status` — `enum UserStatus { active suspended }`, default `active`. Session/guard rejects `suspended`.
2. `EmailLog` — recipient, subject, templateType, organizationId, eventMappingId?, attendeeRef?, status (queued/sent/failed/skipped/disabled), provider (smtp/dev-log), lastError?, createdAt. Indexed by org + (status) + createdAt.
3. `CustomFormField.placeholderEn/placeholderAr` (String?).
4. `EventMapping` location: `venueName? address? city? country? mapUrl? mapEmbedUrl? latitude? longitude?` (Float? for lat/lng).

> Cross-branch dev-DB caveat: the dev DB carries migrations from sibling branches not on `main` (e.g. `add_phone_consent`, `add_live_on_pretix` are on merged PRs). New migrations here are authored against `main`'s history; if `prisma migrate dev` reports drift, apply via `prisma db execute` + `migrate resolve` (as done for `add_live_on_pretix`) rather than resetting the dev DB.

## Permission-boundary test checklist (TDD — write first)
- **Walk-in**: valid staff create · unassigned event denied · finance blocked · impersonation blocked · free→issues QR · COD→pending · seated requires seat · sold-out blocks/waitlist · cross-org denied · audited.
- **Dashboard**: super sees all orgs · org_admin scoped · finance finance-safe only · checkin assigned summary · no cross-org leak.
- **Registrations mgmt**: org isolation · filter/search · CSV respects scope · finance scoped · checkin restricted · QR hidden unless issued · manual create audited.
- **Users**: super role change · org_admin cannot create super_admin · finance blocked · checkin blocked · impersonation blocked · suspended blocked · cross-org denied · role change audited.
- **Email logs**: log created on send · failed logged safely · resend works + audited · cross-org denied · checkin blocked · impersonation blocked · prod dev-log fallback still blocked.
- **Modular fields**: def save · renders for correct ticket · hidden for wrong ticket · required validation · values saved · shown in detail/approval · Arabic label · cross-org denied.
- **Maps**: renders on detail · directions link · missing data safe · Arabic route.
- **Calendar**: Google URL correct · `.ics` route works · hidden/private safe · Arabic route.
- **Portal**: guest magic link still works · own-tickets-only · cannot see other's ticket · pending hides QR · issued shows QR · Arabic route.
- **Arabic**: ar route loads · wizard renders · confirmation renders · RTL applied · no missing keys in critical flows.

## Validation gate (run before PR finalize)
`npm run lint` · `npm run typecheck` · `npm test` · `npm run smoke` · `npm run build` · `npm audit` (+ live e2e if dev stack up). Any skip explained.

## Deferred / not in this PR
- Payments/refunds and promo/vouchers (excluded by user — see matrix).
- File-upload modular field type (deferred unless upload infra already exists — document as placeholder).
- OAuth (Google/GitHub) for attendee accounts (email/password + magic link only).
- Email open/click tracking (do not fake delivered/opened).
- Live Google Places API (manual map URL/embed only).
