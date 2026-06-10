# Strawberry Events — Board Review

> Report-only multi-agent review of `apps/web`. Generated on branch `review/board-review`.
> Pipeline: 12 chunk reviewers → per-chunk adversarial verify → board of 5 → chairman → manager plans.
> Scale: 45 agents. No code was modified.

## Prior posture (carried forward, not re-litigated)

The Strawberry Events platform completed a full production audit on 2026-06-10 (218 tests, green build, zero high/critical CVEs) and subsequently fixed all three CRITICAL blockers (C1–C3: env fail-fast, TLS documentation, secrets hygiene) and all eight HIGH findings (H1–H8: approval state guards, seat holder-scoping with compensating release, Finance role gate on events service, timing-safe inbound webhook secret, mark-paid partial-issue safety, health endpoints, production SMTP safety, and DB performance indexes), growing the test suite to 256 passing. The platform is now a conditional soft-launch candidate for a single trusted organizer running English/GA/COD tickets behind an externally-terminated TLS edge, but remains NO-GO for public, multi-organizer, seated, or bilingual deployment. Key outstanding risks are the real dev credentials on disk pending rotation, TLS not enforced by code (operator must configure Cloudflare or nginx), and a set of explicitly deferred roadmap items including modular form fields, full Arabic UI i18n, cron scheduling, async webhook delivery, Redis rate limiting, and observability/backup hardening.

<details><summary>Already-closed items (11) and deferred roadmap (18)</summary>

**Closed:**
- C1 — Production env fail-fast: new lib/config/env.ts rejects missing/weak/placeholder secrets at startup via instrumentation.ts; magic-link signing requires MAGIC_LINK_SECRET in production
- C2 — TLS clarity: README updated with explicit 'do not run public production over plain HTTP' guidance, Cloudflare full-strict / nginx 443 options documented, Cloudflare real-IP guidance added
- C3 — Secrets hygiene: .env.production.example added with placeholders and rotation+ENCRYPTION_KEY-loss guidance; .env.example updated; no real secrets committed (gitignore confirmed); compose.yaml hardened
- H1 — Safe approval transitions: approve/reject are idempotent; rejecting an issued/approved order is blocked; transitions use conditional updateMany to close TOCTOU race
- H2 — Seat integrity: confirmSeats holder-scoped to attendeeRef/orderCode; holdSeats includes accessible seats and scopes to event; registration uses compensating release+pretix cancel on failure; reject() releases seats
- H3 — Finance role gate: assertCanManageEvents (super/organizer only, impersonation blocked) added to createEvent/updateEvent/createTicket at service layer
- H4 — Webhook secret: header-only via X-Pretix-Webhook-Secret (query-string rejected); crypto.timingSafeEqual via lib/security/compare.ts; 503 when unconfigured; never logs secret
- H5 — Mark-paid safety (finance): pretix sync failure no longer flips local status; 'already paid' tolerated and reconciled; failure audited as order.mark_paid_failed
- H6 — Health endpoints: /api/health (liveness), /api/health/db (DB readiness 200/503), /api/health/ready (config+DB 200/503) — all added
- H7 — Production SMTP safety: emailMode() logic added; missing SMTP in production disables (never fakes success) or fails startup unless ALLOW_EMAIL_DISABLED_IN_PRODUCTION=true
- H8 — Performance indexes: migration add_perf_indexes adds AttendeeOrder (eventMappingId,orderCode), (eventMappingId,status), (eventMappingId,approvalStatus); SeatAssignment heldUntil, attendeeRef; WebhookDelivery (success,nextRetryAt)

**Deferred:**
- TLS enforcement by code — nginx/compose still HTTP-only; operators must manually configure Cloudflare full-strict or nginx 443
- Real credential rotation — apps/web/.env on developer disk still holds real dev pretix token + ENCRYPTION_KEY (gitignored, not committed; must be rotated before production)
- Cron/scheduler wiring — cleanup(), retryDue(), and waitlist auto-promotion remain admin-invoked only; no cron entrypoint
- Async webhook delivery — delivery is still synchronous in-request with fixed 60s backoff
- Redis-backed distributed rate limiting — current rate limiting is in-memory only
- Modular per-ticket custom form fields (H5 audit finding) — CustomFormField/CustomFormAnswer schema exists but zero application code; treat as unbuilt feature on roadmap
- Full Arabic UI i18n (H6 audit finding) — public routes and registration wizard remain hardcoded English; only event content fields (titleAr/descriptionAr) are bilingual
- Observability — no structured logging, metrics, error tracking, or alerting wired
- Backup retention/off-host/restore-drill — scripts exist but backup is local-only with no rotation or recovery test
- Whish live payment integration — deferred
- Live WhatsApp/SMS sending — deferred
- OAuth — deferred
- Visual seat-map editor — deferred
- Webhook delivery dashboard — deferred
- Walk-in registration — deferred
- Standalone badge reprint page — deferred
- Nonce-based strict CSP (currently keeps unsafe-inline for script-src) — deferred
- Accessible-seat designation not preserved across hold/release cycle — documented limitation deferred

</details>

## Chairman decision (ranked)

The platform is in solid engineering shape for a single-trusted-organizer EN/COD soft-launch (256 green tests, clean layering, sound auth/crypto primitives), so most defects are not launch-blockers — but a small cluster genuinely is. Three issues block the conditional soft-launch outright: the admin sidebar ships three 404 links (the "Staff" one actively misdirects), the issued-ticket QR swallows errors into a permanent spinner leaving attendees unable to enter, and an order-code IDOR exposes any attendee's PII plus a working magic-link token at any event URL. A second tier of must-fix-before-multi-org items covers authorization seams (finance-role PII access, empty-waitlist bypass, null-org scope, SSRF in operator webhook URLs) and the half-built "pretix is source of truth" invariant (the inbound webhook only logs, updateEvent silently drops the live flag, and visibility is unreconciled with pretix live so drafts can leak). The validated-then-discarded data contract (mandatory phone/consent collected then thrown away, with no Terms/Privacy links) is a credibility and compliance risk the moment a real attendee registers, made cheap to fix because UserProfile already has the columns. Lower-priority items (branding/theme parity, i18n locale-on-order, idempotency, dead-code sweep, ICS conformance) are deferred as roadmap, and Whish live-payment work plus the dead WEBHOOK_SECRET fallback are out of scope or rejected. Ranking weights launch-blocking attendee/security impact first, then multi-org isolation, then correctness/data-integrity, then polish.

| # | Decision | Domain | Verdict | Rationale |
|---|----------|--------|---------|-----------|
| 1 | Remove or back the three 404 admin nav links (Registrations, Staff, Settings) | UI/UX | **approve** | Merges UI/UX P0 and the admin-ui HIGH finding. layout.tsx:14-17 renders nav entries to routes with no page.tsx; every admin who clicks 404s, and 'Staff' actively misdirects since the check-in UI lives at a different (staff) URL. First-click-visible, trust-destroying, trivial fix (delete dead entries, optionally point a Check-in link at the real route). Launch-blocking. |
| 2 | Give QrCodeDisplay a visible text fallback instead of an infinite spinner | UI/UX | **approve** | Merges UI/UX P0, dev P2, and public-ui finding. qr-code-display.tsx:15 .catch(()=>{}) leaves src null forever and renders the pulse skeleton indefinitely, so any QR-generation error means an attendee literally cannot retrieve their ticket. Render the raw order code / pretixSecret as selectable text on error. Directly blocks the core attendee outcome. |
| 3 | Scope order-code lookup to the event slug (fix horizontal IDOR / PII + token exposure) | Cybersecurity | **approve** | Merges security P0 and public-ui finding (verified). getOrderByCode (access.ts:4-8) queries by orderCode alone; confirmation and payment-pending pages take a slug they never use. Low-entropy, shareable order codes expose another attendee's PII and a working magic-link token at any event URL. Add eventMapping:{pretixEventSlug:slug} to the where clause. Cheap, directly exploitable even at single-org scope. |
| 4 | Add a role assertion to searchAttendees to stop finance-role PII access | Cybersecurity | **approve** | Security P0 (verified). searchAttendees (checkin/service.ts:44) calls only resolveEvent→canAccessEvent, which grants finance members org-wide access; the layout requireRole excludes finance but server actions are callable directly. A finance member can invoke searchAction and harvest attendee orderCode/email/name. Add assertCanCheckin(session) at the top, matching checkInOrder. One-line fix to a real PII exposure. |
| 5 | Persist phone + consent (use existing UserProfile columns) and link real Terms/Privacy | Program architecture | **approve** | Merges graphic P1, UI/UX P1, dev P1, architect P2 (verified data loss). The wizard hard-requires phoneCC/phone and both consent checkboxes, then service.ts:120-139 persists none; consent labels link to nothing. Architect confirms UserProfile already has phone/phoneCC/preferredLocale columns, so this is the flow failing to use an existing model, not a schema gap. User-hostile and a consent-audit hazard the moment a real attendee registers. Store the fields + a consent timestamp and wire the policy links, or drop the fields — schema and persistence must agree. |
| 6 | Implement the inbound pretix webhook reconciliation path (order.paid/canceled/checkin) | Program architecture | **approve** | Architect P0. api/webhooks/pretix/route.ts verifies the secret then only console.info's — nothing flows pretix→platform, so AttendeeOrder.status, seat state, and approval issuance can never reconcile to refunds, manual pretix actions, or pretixSCAN check-ins. This is the platform's single load-bearing architectural commitment and it is a stub. Build a typed dispatcher off event.action (start with order.paid→markPaid/issue, order.canceled→seat release), gated idempotently on orderCode. Fetching positions on the paid event also retires the always-null pretixSecret problem (folds in dev P2). |
| 7 | Reconcile storefront publish contract and forward input.live in updateEvent | Program architecture | **approve** | Merges dev P0 (updateEvent drops input.live — verified HIGH, one-line fix at service.ts:179) and architect P1 plus the public.ts live-filter finding. visibility='public' is independent of pretix live:false, so drafts leak to the storefront the instant visibility flips, and the live toggle is a no-op on edit. Add a local liveOnPretix boolean kept in sync by the rank-6 webhook, require visibility='public' AND liveOnPretix in listPublicEvents/getPublicEvent, and forward input.live. Closes a draft-leak hole and removes a per-request pretix call. |
| 8 | Validate webhook target URLs and block SSRF to internal/metadata endpoints | Cybersecurity | **approve** | Security P1. createWebhook (admin-service.ts:36) and deliver() (deliver.ts:27) fetch arbitrary operator-supplied URLs with no scheme/host validation; testWebhook returns the response code as an oracle, letting an organizer_admin probe 169.254.169.254 or internal services. Enforce https at creation and resolve+reject loopback/link-local/RFC1918 hosts before fetch. Required before any multi-organizer deployment; can be deferred only if the soft-launch keeps webhooks disabled. |
| 9 | Close multi-tenant isolation seams (listWaitlist check, null-org guard, resolveOrgId dedup) | Cybersecurity | **approve** | Bundles security P1 (listWaitlist empty-list bypass, waitlist/service.ts:56-63 — verified), security P2 (null organizationId fails open in handler.ts:44 — verified), dev P2 + admin-ui finding (inline resolveOrgId in api-keys/webhooks pages already diverges from the shared lib on the finance role — verified live). Each is dormant at single-org scale and becomes a cross-org leak on day one of multi-org. Make access checks unconditional, fail closed on null org, and consolidate to the shared resolveOrgId export. Precondition for lifting the multi-org NO-GO. |
| 10 | Sanitize internal error messages on public and API surfaces | Development | **approve** | Merges UI/UX P2, dev P1, security P2 (verified in registerAction actions.ts:51-53 and POST /attendees route.ts:58). Both return (err as Error).message verbatim, leaking pretix bodies, endpoint names, and seat/capacity internals to browsers and integrators. Map known error types to safe codes, log raw server-side, return a generic message; narrow the unsafe (err as Error) cast. Low effort, broad surface. |
| 11 | Make promote() and other repeatable mutations idempotent | Development | **approve** | Dev P1 (verified). waitlist/service.ts:85-88 does an unconditional update to status='promoted' then fires email+audit+webhook, so a race or direct API call duplicates all side effects. Switch to updateMany({where:{id,status:'waiting'}}) and gate side effects on count===1; audit the same discipline across approval/mark-paid flows. Correctness/data-integrity fix that should land before features expand on these models. |
| 12 | Make testSmtpAction exercise the real SMTP transport | Development | **approve** | Merges dev P1 and admin-ui MEDIUM (verified). integrations/actions.ts:30 uses NODE_ENV!=='production' as the success signal, so in production the test button always reports failure regardless of real config — operators have no way to verify SMTP. Call the real sendEmail()/transport and report the actual result. Operability fix; grep-sweep for other environment-as-proxy antipatterns. |
| 13 | Add a per-IP dimension to the login rate limiter | Cybersecurity | **approve** | Security P1. auth/config.ts:36 keys the limiter only on login:email, capping per-account but offering no defense against one IP spraying many accounts. Add a parallel per-IP (or per-IP+email) window. Note the limiter is in-memory single-instance, so behind multiple instances this must eventually move to Redis (a documented deferred item) — the per-IP key is the cheap immediate win. |
| 14 | Guard calendar export and Register CTA for undated and coming-soon events | UI/UX | **approve** | Merges UI/UX P1 and the events-calendar/public-ui findings (verified). page.tsx:43 builds the calendar with start: dateFrom ?? new Date(), so an undated event silently produces an entry stamped at render time; AddToCalendar renders unconditionally. Hide it when dateFrom is null. Separately add a comingSoon guard on both the CTA and the register page, since /register renders the wizard unconditionally and a user can register for a not-yet-open event. Bundle the low-severity ICS UID/folding cleanups (ics.ts) here as the same file is touched. |
| 15 | Attribute API-key-driven mutations in the audit log | Cybersecurity | **defer** | Security P1, verified. checkins/route.ts:63 writes actorUserId:null and POST /attendees writes no audit row; AuditLog has no actorApiKeyId column. A compromised key is untraceable post-incident — a real accountability gap, but it requires a schema migration and the external API surface is minimal at single-org soft-launch. Defer to the pre-multi-org hardening pass alongside the isolation work. |
| 16 | Add admin theme toggle/branding and localize hardcoded English (locale-on-order) | Graphic design | **defer** | Bundles graphic P1/P2 (admin shell has no ThemeToggle, plain wordmark vs public gradient, dead --font-heading alias, grayscale chart tokens) with the platform-wide hardcoded-'en' email locale (verified in approval/finance/waitlist service). Store locale on AttendeeOrder/UserProfile and read it in comms. Not launch-blocking for one English/COD organizer; legitimate roadmap once bilingual or multi-org scope is taken on. Group as a branding+i18n milestone. |
| 17 | Replace component-local selectable() with the tested canSelect() | Development | **defer** | Merges dev P3 and UI/UX P2 (verified). seat-selector.tsx:21-23 ignores heldUntil, so a hold that expires mid-session leaves seats amber/unselectable until reload, and leaves canSelect/isHoldExpired as dead tested exports. Importing canSelect fixes the divergence and retires dead code. Server releases expired holds before render, so initial-load impact is nil; defer as a clean single-source-of-truth fix bundled with the dead-code sweep. |
| 18 | Add observability and pagination: webhook emit logging, audit cursor, pretix readiness probe | Program architecture | **defer** | Bundles architect P1 (operability) with dev P2 (webhooks/service.ts:91 empty catch — verified) and the audit take:100/no-cursor finding (verified). Add a console.error to the swallowed webhook catch, cursor/offset to the audit query, and wire pretixHealthCheck into /api/health/ready so a pretix outage is visible to monitoring. Low risk, high operability payoff, but none block the soft-launch; schedule as one operability PR. |
| 19 | Set Secure flag on the hand-rolled active_org cookie and guard HSTS behind TLS | Cybersecurity | **defer** | Bundles security P2 (active-org.server.ts:53-57 missing secure — verified) with the cross-cutting HSTS finding (headers.ts emits a 2-year preload whenever NODE_ENV=production regardless of actual TLS — verified). Both are real production-hardening gaps but neutral under the soft-launch's externally-terminated TLS assumption. Add secure:NODE_ENV==='production' to the cookie and gate HSTS on APP_URL starting with https. Defer to the deployment-hardening checklist. |
| 20 | Dead-code sweep and type-hygiene cleanup (providers registry, secret fallback, dead branches) | Development | **defer** | Bundles dev P3 dead-code list with the providers-registry 'whish' type mismatch (provider.ts — verified, a pure type/registry hygiene fix, NOT Whish payment work), the dead redeemCheckin PretixError branch (checkin.ts:63 — verified), and the dead MAGIC_LINK_SECRET→WEBHOOK_SECRET fallback (magic-link.ts:4 — verified, not yet removed so in scope). Do as one auditable cleanup PR. Low risk, improves signal-to-noise; not launch-blocking. |
| 21 | Document the schema-vs-reality gap and define a single scheduled-task seam | Program architecture | **defer** | Merges architect P2 and P3. Roughly a third of the schema (CustomFormField, ApprovalRule, SeatMap hierarchy, ReminderSetting, archive/cleanup, waitlist auto-promotion, webhook retryDue) is present but unwired, and four capabilities are blocked on the same missing scheduler. Add an ARCHITECTURE/ROADMAP doc marking each model wired|scaffold|deferred and define one /api/internal/tick contract so cron lands as a single decision. Pure documentation/structure work; defer but do before the next engineer mis-judges capabilities. |
| 22 | Whish live-payment provider wiring | Development | **reject** | Explicitly out of scope per review constraints (Whish live payments). The platform ships free/manual_cod only for the COD soft-launch. The provider.ts registry type mismatch is handled as type hygiene under rank 20; actual Whish integration is rejected here, not deferred. |

**Totals:** 14 approved · 7 deferred · 1 rejected

## Board of 5 — assessments & recommendations

### Graphic design

Public-ui has a coherent identity (token system with light/dark palettes, a rose-to-violet brand gradient across wordmark/hero/stepper, server-rendered theme, RTL overrides) but it is half-realized. Admin-ui is un-branded and has no dark-mode toggle (admin/layout.tsx lacks ThemeToggle), so admins are stuck in forced-light with neutral chrome and a plain text wordmark versus the public gradient mark. Tokens are inconsistent: --font-heading aliases --font-sans (no display face) and chart-1..5 are grayscale oklch unrelated to the brand. RTL/i18n holes: AvailabilityBar, capacity labels and Stepper hardcode English that injects LTR text into RTL Arabic; badge TAG_COLOR duplicates brand hex literals. Not launch-blocking for one English/COD organizer but compounds at multi-org/bilingual scale.</parameter>
</invoke>


- **[P1] Add theme toggle and brand to admin shell** — admin/layout.tsx has no ThemeToggle so admins stay forced-light with neutral chrome; reuse the existing ThemeToggle and apply primary/gradient accents.
- **[P1] Localize hardcoded English in visual components** — AvailabilityBar labels, capacity labels and Stepper text are literal English that breaks RTL Arabic layouts; route through next-intl.
- **[P2] Unify wordmark across public and admin** — public-nav uses a gradient-clipped wordmark, admin uses plain text; extract one shared Wordmark component.
- **[P2] Fix chart tokens and dead font-heading alias** — chart-1..5 are off-brand grayscale and --font-heading aliases --font-sans; add a brand ramp and display face or remove the dead token.
- **[P3] Source badge colors from design tokens** — badge-template.tsx hardcodes colors identical to brand tokens which will drift; source from a shared constants module.

### UI/UX (information architecture, user flows, form usability, state coverage, accessibility, mobile, navigation correctness)

Through the UI/UX lens the platform's happy-path flows are competently built — the registration wizard has a clean 3-step stepper, sticky mobile action bar, autocomplete hints, reduced-motion support, and explicit busy/error states; the attendee state pages cover all five registration states with sensible copy. But three categories of defect undermine real-world usability. (1) Navigation correctness is broken: the admin sidebar ships three links (Registrations, Staff, Settings) that 404, and the most confusing is "Staff" — the staff check-in UI genuinely exists, just at a different URL, so admins are actively misdirected. This is the single most visible flaw an evaluator hits on first click. (2) Form honesty: the wizard forces phone + country code and two consent checkboxes as required, then silently discards all of them (no DB columns, no audit trail) — a user-hostile contract that asks for mandatory input and throws it away, with the consent checkboxes also having no link to any actual Terms/Privacy document. (3) Dead-end and missing states: QR rendering failure leaves a permanent spinner with no fallback code (attendee literally cannot get into the event), the check-in panel shows no empty-state or result count after a zero-result search, the payment-pending page gives the user no way to return to their order, expired seat holds become permanently un-reclaimable mid-session, and the calendar widget silently stamps "now" as the start time for undated events and renders even for sold-out/coming-soon events. Several flows also leak raw internal error strings to end users. The bilingual remit is effectively unmet for the launch scope (emails hardcoded to English, Arabic titles fall back), but that is an accepted deferral. None of these block the conditional single-organizer English/COD soft-launch except the broken nav and the QR dead-end, but the form-honesty issues are a credibility risk the moment a real attendee uses the product.

- **[P0] Remove or back the three 404 admin nav links (Registrations, Staff, Settings)** — layout.tsx:14-17 renders nav entries pointing at /registrations, /staff, /settings — none have a page.tsx, so every super/org-admin who clicks them hits a 404. 'Staff' is the worst because the staff check-in UI exists at a different URL ((staff) route group), so admins are misdirected rather than just blocked. Cheapest correct fix: delete the three dead entries from NAV (and point a 'Check-in' link at the real (staff)/staff/checkin route if staff access is wanted from the admin shell). First-click-visible, undermines trust in the whole back-office.
- **[P0] Give QrCodeDisplay a visible fallback instead of an infinite spinner** — qr-code-display.tsx:15 swallows QRCode.toDataURL errors with .catch(() => {}), leaving src=null forever and rendering the animate-pulse skeleton indefinitely (line 22). On the issued-ticket page this means an attendee who hits any QR generation error has literally no way to retrieve their ticket. Add an error state that renders the raw order code / pretixSecret as selectable text so staff can check them in manually. Directly blocks the core attendee outcome.
- **[P1] Stop collecting phone + consent as required when they are silently discarded** — The wizard hard-requires phoneCC/phone (next() guard line 63) and both consent checkboxes (submit() line 83), but register()/AttendeeOrder persist none of them and there are no DB columns. Asking for mandatory data and throwing it away is a user-hostile contract and, for consent, a compliance hazard with no audit trail. Either persist them (schema + columns + consent audit-log entry) or drop the fields from the form and schema. At minimum the consent checkboxes must link to real Terms/Privacy documents — today they are bare label text (lines 241,249) referencing policies the user can never read.
- **[P1] Suppress or guard calendar export and the Register CTA for invalid event states** — page.tsx:43 builds the calendar with start: dateFrom ?? new Date().toISOString(), so an undated event (pretix unreachable) silently produces a calendar entry stamped at page-render time; AddToCalendar (ticket-rail.tsx:51) renders unconditionally. Hide AddToCalendar when dateFrom is null. Separately, TicketRail/MobileCtaBar disable Register on soldOut but there is no comingSoon guard, and register/page.tsx renders the wizard unconditionally — a user can submit a registration for a coming-soon event by visiting /register directly. Add a comingSoon guard on both the CTA and the register page.
- **[P2] Add empty-state and result-count feedback to the check-in search panel** — checkin-panel.tsx renders the results <ul> with no branch for rows.length === 0, so a search that matches nothing shows the same blank UI as before searching — staff at a physical desk can't tell 'no match' from 'didn't run'. Add an explicit 'No attendees found' message and a result count. Pair with the confirmed gap that attendeeName is not in the search query (service.ts:53) even though the placeholder advertises name search — both make the desk experience confusing under time pressure.
- **[P2] Show generic user-facing errors; never surface raw internal messages** — registerAction (actions.ts:51-53) returns (err as Error).message verbatim, and the wizard renders it directly (registration-wizard.tsx:103). Pretix/seat/network errors leak endpoint names and internal detail into the attendee's browser. Map known failures to friendly copy ('Registration failed, please try again') and log the raw error server-side. Same pattern should be applied wherever service errors reach a public surface.
- **[P2] Fix stale UI and un-reclaimable seats after in-session state changes** — Two related interaction bugs: (a) approve/reject from the approval detail page revalidates only the list route, so the detail view keeps showing 'pending' with live buttons until manual refresh (actions.ts:23,38) — add router.refresh() in DecisionButtons or revalidate the detail path; (b) SeatSelector.selectable() (seat-selector.tsx:21-23) ignores heldUntil, so a hold that expires while the wizard is open leaves those seats amber and unselectable until reload — import canSelect() from state.ts so the user can reclaim them in-session.
- **[P3] Make the payment-pending page actionable and consistent with AttendeeStateView** — payment-pending/[orderCode]/page.tsx:18-34 renders bespoke prose and only echoes the order code, never surfacing the magic-link /t/<token> URL it already has in scope. The user has no way to bookmark or return to their order. Reuse AttendeeStateView (which already handles pending_payment) or add a 'View / save your ticket' self-link, so this state matches the rest of the post-registration surface.
- **[P3] Add pagination to the audit log and surface bilingual/locale gaps in admin** — The audit page (service.ts:88) caps at take:100 with no offset/cursor, so older entries become permanently invisible once an org passes 100 events — add cursor pagination. Separately, because approval/finance/waitlist emails are hardcoded to 'en' and the public storefront shows Arabic titles only when present, the admin UI should make the English-only-comms limitation visible to organizers rather than letting it surprise Arabic-speaking attendees; this keeps the deferred bilingual scope honest without building full i18n now.

### Development / code quality (correctness, type safety, error handling, idempotency/transactions, test coverage, dead code, maintainability, dependency hygiene)

The codebase is in genuinely good engineering shape for its stage: a 256-test suite with a healthy spread of unit/integration/e2e coverage per chunk, a green build, clean separation of pure logic (state.ts, capacity.ts, schema.ts) from side-effecting service layers, and disciplined patterns (Zod parse at the boundary, centralized pretix transport, audit + best-effort webhook emission, compensating seat rollback on registration failure). The defects that remain are not architectural rot but a consistent class of "validated-then-discarded" and "type/registry-says-X-but-code-does-Y" inconsistencies that erode the contract between layers. The single most important correctness bug from a dev lens is updateEvent silently dropping input.live (a confirmed HIGH): the form collects a value, the action forwards it, and the service drops it on the floor with no type error — a textbook case of a wide input type that the implementation quietly under-honors. The same shape recurs across the platform: registration requires phone/phoneCC and consentTerms/consentPrivacy then never persists them; the providers registry types a 'whish' key that SelectedProvider cannot represent; pretixSecret is typed optional and is therefore always null with no compile-time signal; and several error paths (registerAction, POST /attendees, redeemCheckin's dead PretixError branch) lean on raw (err as Error).message or unreachable casts that bypass type safety. Secondary themes are non-idempotent mutations (promote() re-fires emails/webhooks), silent error swallowing (webhook emit catch{}, QR .catch(()=>{}), testSmtpAction's NODE_ENV proxy), and a meaningful pile of dead/unwired exports (NotImplemented stubs, canSelect, providers registry, duplicated resolveOrgId, hashPassword bypassed by seed) that inflate the maintenance surface and let real logic (canSelect vs the component's divergent selectable()) silently drift. None of these block the scoped single-organizer/EN/GA/COD soft-launch, but the data-loss and idempotency items should be closed before any feature expansion touches those models.

- **[P0] Forward input.live in updateEvent (fix silently-dropped live flag)** — Confirmed HIGH. events/service.ts:179 passes only {titleEn, titleAr, date_from} to pretixEvents.updateEvent, omitting input.live that createEvent (line 86) honors and that event-form.tsx:114 collects. Editing an event can never toggle pretix publish state — a real correctness bug with a one-line fix. It also exposes a type-safety gap: the patch object should be typed to require the same fields createEvent supplies so the omission would have been a compile error.
- **[P1] Resolve the phone/phoneCC + consent validated-then-discarded contract** — schema.ts:11-12,19-20 require phoneCC, phone, consentTerms, consentPrivacy, but service.ts:120-139 persists none of them and AttendeeOrder has no columns. This is silent data loss of mandatory user input and, for consent, a missing audit trail. Decide per-field: add nullable Prisma columns + write them (preferred for phone and consent timestamps), or relax the schema to optional. Either way the schema and the persistence layer must agree.
- **[P1] Stop leaking raw internal error messages to clients** — registerAction (register/actions.ts:51-53) and POST /attendees (route.ts:58) both return (err as Error).message verbatim, forwarding pretix/seat/infra detail to the browser and to API consumers. Map known error types (PretixValidationError, capacity/approval) to safe codes and fall back to a generic message, logging the raw error server-side. The (err as Error) cast itself is an unsafe-typing smell — catch is unknown and should be narrowed.
- **[P1] Make promote() and other repeatable mutations idempotent** — waitlist/service.ts:85-88 does an unconditional update to status='promoted' then fires email+audit+webhook; re-invocation (race or direct API call) duplicates all side effects. Switch to updateMany({where:{id,status:'waiting'}}) and gate side effects on count===1. Same idempotency discipline should be audited across mark-paid-adjacent and approval flows.
- **[P1] Make testSmtpAction actually exercise the transport** — integrations/actions.ts:30 uses NODE_ENV!=='production' as the success signal, so in production the test button always reports failure regardless of real SMTP config — a false-negative that gives operators no way to verify config. Call sendEmail()/the real transport and report the actual result. This is the kind of environment-as-proxy-for-behavior antipattern that should be grep-swept for elsewhere.
- **[P2] Fix pretixSecret always-null (expand=positions) and tighten the optional type** — orders.ts createOrder issues no ?expand=positions, so order.positions?.[0]?.secret at service.ts:136 is always null for every registration; check-in works only via the orderCode fallback. Add the expand param (or a follow-up getOrder). The optional positions typing masked this at compile time — worth modeling the create-response shape explicitly so callers don't silently read absent fields.
- **[P2] Add visible error fallback in QrCodeDisplay and observability to swallowed catches** — qr-code-display.tsx:15 .catch(()=>{}) leaves a permanent spinner with no way to read the raw code; render a text fallback (order code/secret) on error. Likewise webhooks/service.ts:91 swallows all emit errors with no log — add a console.error before the closing brace to keep fire-and-forget while making DB failures observable. Empty catch blocks are a recurring maintainability hazard here.
- **[P2] Reconcile payments provider registry with SelectedProvider type** — provider.ts types the registry with a 'whish' key that SelectedProvider ('free'|'manual_cod') cannot represent and selectProvider can never return. Any future iterator over providers hits an id the type system rejects. Align the union or annotate the entry as not-selectable so the inconsistency is encoded, not latent. (Not Whish live-payment work — purely a type/registry hygiene fix.)
- **[P2] De-duplicate resolveOrgId and route seed through hashPassword** — api-keys/page.tsx:9 and webhooks/page.tsx:9 inline a resolveOrgId that already diverges from lib/admin/resolve-org.ts (the inline copy omits the 'finance' role) — a live divergence, not just future risk; replace with the shared import. Separately, seed.ts duplicates argon2 params instead of importing hashPassword(), risking silent cost-config drift. Both are single-source-of-truth fixes.
- **[P3] Replace component-local selectable() with the tested canSelect()** — seat-selector.tsx defines its own selectable() that diverges from the unit-tested canSelect() in state.ts for expired holds, causing a UX bug and leaving canSelect/isHoldExpired/SeatLike as dead, tested-but-unused exports. Importing canSelect both fixes the divergence and retires the dead code — a clean example of letting the tested pure function be the single source of truth.
- **[P3] Sweep confirmed dead code and unwired stub exports** — A sizable confirmed list (questions.ts/vouchers.ts + NotImplemented, pretixHealthCheck, providers/PaymentProviderMeta/WhishProvider, hashesEqual, webhooks:manage scope, listDeliveries, decryptField, isEmailDisabledInProduction, several UI card/button exports and *Data/*Ticket interfaces) inflates the maintenance surface and obscures what is actually wired. Either delete or annotate as intentional roadmap stubs. Low risk, high signal-to-noise improvement; do as a single dedicated cleanup PR so the diff is auditable.
- **[P3] Harden the MAGIC_LINK_SECRET fallback and remove dead error/branch casts** — magic-link.ts:4 falls back to a bare WEBHOOK_SECRET that the env validator never checks (it validates PRETIX_WEBHOOK_SECRET), making the branch dead-but-misleading; remove it so code and validator agree. Similarly drop the unreachable second catch branch in checkin.ts:63 and replace its double-cast reason-extraction with a typed accessor. These are small type-safety/consistency cleanups that prevent future silent fallbacks.

### Cybersecurity

Through the security lens, the platform's core authn/crypto primitives are sound — argon2id hashing, JWT sessions with production __Secure- cookies, SHA-256 hashed API keys with scope + rate-limit enforcement, AES-256-GCM secret storage, and timing-safe inbound pretix-webhook secret verification (safeEqual) are all present and correctly wired. However several authorization and isolation gaps remain that gate a NO-GO for public/multi-org. The most material confirmed defects are (1) order-code lookup with no event-slug scoping (registration/access.ts:4-8) — a horizontal IDOR letting any held order code expose attendee PII and a usable magic-link token at any event URL; (2) searchAttendees lacking a role gate (checkin/service.ts:44), exposing attendee PII to finance-role org members who canAccessEvent grants org-wide; (3) listWaitlist skipping its access check on empty waitlists; and (4) latent org-isolation softening where a null key.organizationId silently drops the Prisma org filter (handler.ts:44). Beyond the prior findings list, I confirmed two additional gaps in my remit: outbound webhook delivery (webhooks/deliver.ts:27 and admin-service.ts:36) fetches operator-supplied URLs with zero validation — no https enforcement, no scheme check, no private-IP/metadata-endpoint blocklist — a classic server-side request forgery (SSRF) primitive that lets an organizer_admin point a webhook at http://169.254.169.254 or internal services and observe response codes; and the login rate limiter is keyed solely on email (config.ts:36), so it throttles per-account but provides no per-IP defense against distributed credential-stuffing or a single attacker spraying many accounts. API-key-driven mutations also remain unattributable in the audit trail (no actorApiKeyId column), and MAGIC_LINK_SECRET carries a dead WEBHOOK_SECRET fallback that could silently cross-wire a key from another subsystem. The single-instance in-memory rate limiter is a known horizontal-scaling caveat but is correctly documented as such.

- **[P0] Scope order-code lookup to the event slug (fix horizontal IDOR / PII + token exposure)** — getOrderByCode (registration/access.ts:4-8) queries by orderCode alone; both confirmation and payment-pending pages take a slug param and never use it. Any single valid order code exposes another attendee's name, email, event, approval status, and a working magic-link token at ANY event URL. Add eventMapping: { pretixEventSlug: slug } to the findFirst where clause (or a slug-scoped variant) for both public pages. Order codes are low-entropy and shareable, so this is directly exploitable.
- **[P0] Add a role assertion to searchAttendees to stop finance-role PII access** — searchAttendees (checkin/service.ts:44) calls only resolveEvent, which delegates to canAccessEvent — and canAccessEvent grants org-wide access to finance members. The staff layout requireRole excludes finance, but server actions are callable independently of the rendered page. A finance org member can invoke searchAction directly and harvest attendee orderCode/email/name. Add assertCanCheckin(session) at the top of searchAttendees, matching checkInOrder.
- **[P1] Validate webhook target URLs and block SSRF to internal/metadata endpoints** — createWebhook (webhooks/admin-service.ts:36) and deliver() (webhooks/deliver.ts:27) accept and fetch an arbitrary operator-supplied URL with no validation — no https enforcement, no scheme allowlist, no rejection of loopback/link-local/RFC1918 hosts or 169.254.169.254. testWebhook gives an immediate oracle for the response code. An organizer_admin (or anyone who compromises that role) can probe internal services and cloud metadata. Enforce https:// at creation, resolve and reject private/loopback/link-local IPs before fetch, and consider an egress allowlist. Required before any multi-organizer deployment.
- **[P1] Make listWaitlist enforce canAccessEvent unconditionally** — The access check in waitlist/service.ts:56-63 sits inside an `if (first && ...)` block, so an empty waitlist returns [] with no authorization performed. Any authenticated session holding a valid eventMappingId can confirm event existence / emptiness cross-org via the API route. Move canAccessEvent out to run against the requested eventMappingId before the entries query, independent of whether any entries exist.
- **[P1] Add a per-IP dimension to the login rate limiter** — auth/config.ts:36 keys the limiter only on `login:${email}`. This caps attempts per account but offers no defense against an attacker spraying one password across thousands of accounts from one IP, nor distributed stuffing. Add a parallel per-IP (or per-IP+email) window so a single source is throttled regardless of which accounts it targets. Note the limiter is in-memory single-instance — behind multiple app instances this must move to Redis to be effective (already a documented deferred item).
- **[P1] Attribute API-key-driven mutations in the audit log** — The POST check-in handler writes actorUserId: null (checkins/route.ts:63) and POST attendees writes no audit row at all; AuditLog has no actorApiKeyId column. A compromised or misused API key leaves no traceable trail in post-incident review — a real accountability gap for the external API surface. Add an optional actorApiKeyId column (schema + migration) and populate ctx.keyId on API-originated writes, including a register() audit entry.
- **[P2] Guard against null organizationId silently broadening API-key event scope** — resolveApiEvent passes organizationId: ctx.organizationId ?? undefined to Prisma (handler.ts:44); a null org id makes Prisma omit the filter entirely, letting a key see events from any organization. createApiKey always sets a non-null org today, so this is latent, but it is a fail-open default that should fail closed: throw ApiError('forbidden_event', ...) when ctx.organizationId is null rather than widening scope.
- **[P2] Sanitize internal error messages returned to public/API clients** — registerAction (public register actions.ts:51-53) and POST /attendees (attendees/route.ts:58) return raw (err as Error).message — pretix API bodies, endpoint names, capacity/seat internals — verbatim to the browser/integrator. Map known error types to safe v1 codes, log the raw error server-side only, and return a generic message for unknown errors to avoid leaking infrastructure detail.
- **[P2] Set Secure flag on the hand-rolled active_org cookie** — active-org.server.ts:53-57 sets the super-admin org-switching cookie with httpOnly/sameSite/path but no secure, while Auth.js cookies correctly gate Secure on production. In production this cookie can be transmitted over plain HTTP to the same host, contradicting the HTTPS-only intent. Add secure: process.env.NODE_ENV === 'production'.
- **[P3] Remove the dead MAGIC_LINK_SECRET → WEBHOOK_SECRET fallback** — magic-link.ts:4 reads MAGIC_LINK_SECRET || WEBHOOK_SECRET, but the env validator checks MAGIC_LINK_SECRET and PRETIX_WEBHOOK_SECRET — never a bare WEBHOOK_SECRET. The fallback is effectively dead today but would silently cross-wire a token-signing key from another subsystem if validation were ever bypassed or refactored. Drop the fallback so the code and validator agree on a single dedicated secret.

### Program architect — overall structure, module boundaries, multi-tenant model, pretix-as-source-of-truth coherence, scalability, operability, product direction

The platform is well-layered and the module boundaries are genuinely sound: a single pretix transport, org-scoped Prisma where-builders, pure-function state layers (approval/state.ts, seats/state.ts) shared across halves of a chunk, and service layers cleanly separated from server actions and routes. For the sanctioned soft-launch scope (single trusted organizer, EN/GA/COD, externally-terminated TLS), the architecture holds. But the "pretix is the source of truth" invariant is only half-built and this is the dominant architectural risk. Writes flow platform→pretix correctly, yet nothing flows pretix→platform: the inbound webhook (api/webhooks/pretix/route.ts) verifies the secret and console.info's the event, then drops it — no order sync, no attendee-state reconciliation, no seat release, no automatic-approval issuance. Every read that matters (capacity, check-in) re-queries pretix live, which papers over the gap at the cost of per-request pretix latency on the public storefront and a hard dependency on pretix being reachable (with no readiness-probe coverage, since pretixHealthCheck is unwired). The local DB and pretix can therefore silently diverge — most visibly in the public-live-flag mismatch (visibility='public' is independent of pretix live:false, so drafts leak) and the always-null pretixSecret. Compounding this, the schema encodes a far more ambitious product (CustomFormField, ApprovalRule with JSON conditions, SeatMap hierarchy, ReminderSetting, multi-list check-in, per-ticket waitlist, impersonation, archive lifecycle) than the wired code delivers — roughly a third of the data model is dead weight today. That is a deliberate roadmap skeleton, but it means the gap between "what the schema promises" and "what the live flow does" is wide enough that operators and the next engineer will mis-judge capabilities. Multi-tenancy isolation is structurally correct (org-scoped where-fragments, unique pretixOrganizerSlug) but has thin spots that the cross-cutting audit already flagged (empty-waitlist bypass, null-org API key, duplicated resolveOrgId that diverges on the finance role) — none catastrophic at single-org scale, all latent landmines the moment a second organizer is onboarded. Notably, UserProfile already carries phone/phoneCC/preferredLocale columns, so the discarded-phone-data and hardcoded-'en'-email defects are the registration flow failing to use a model that already exists, not a missing model — a cheap structural fix.

- **[P0] Make the inbound pretix webhook authoritative — implement the pretix→platform reconciliation path** — The 'pretix is source of truth' invariant is currently one-directional. api/webhooks/pretix/route.ts only logs. Without a dispatch layer that reacts to order.paid/order.canceled/checkin events, the local AttendeeOrder.status, seat state, and approval issuance can never reconcile to pretix-side changes (refunds, manual pretix-admin actions, pretixSCAN check-ins). This is the single most load-bearing architectural commitment in the platform and it is a stub. Build a typed action dispatcher off event.action, start with order.paid→markPaid/issue and order.canceled→seat release, and gate it idempotently against orderCode. This also retires the always-null-pretixSecret problem if you fetch positions on the paid event.
- **[P1] Decide and enforce the storefront publish contract: reconcile local visibility with pretix live** — Two independent overlapping controls (EventMapping.visibility and pretix live) with no reconciliation means draft events leak publicly the instant visibility='public' is set, and updateEvent silently drops the live flag entirely so the toggle is a no-op after creation. Pick one authority. Architecturally cleanest: add a local liveOnPretix boolean kept in sync by the webhook from recommendation 1, have listPublicEvents/getPublicEvent require visibility='public' AND liveOnPretix, and fix updateEvent to forward input.live. This removes the per-request pretix getEvent on every storefront hit and closes the draft-leak hole in one move.
- **[P1] Wire the readiness probe to pretix and add structured operability signals** — Operability is the weakest non-security dimension. pretixHealthCheck exists but /api/health/ready only checks DB+config, so an unreachable pretix — the backend the whole platform depends on for live reads — is invisible to monitoring. Webhook emit() swallows all errors with no log, and the audit query has no pagination. For a platform whose correctness hinges on a live external dependency, blind spots here turn a pretix outage into a silent storefront/registration failure. Add pretixHealthCheck to the readiness route, add a console.error to the webhook emit catch, and add offset/cursor to audit query().
- **[P1] Close the multi-tenant isolation seams before any second organizer is onboarded** — Isolation is correct by construction today but only because there is one org and the application code always supplies organizationId. The latent holes — listWaitlist skipping the access check on empty results, handler.ts treating null organizationId as 'see all orgs', and the duplicated resolveOrgId in api-keys/webhooks pages that already diverges from the shared version on the finance role — are exactly the class of bug that stays dormant at single-tenant scale and becomes a cross-org data leak on day one of multi-org. These should be hard gates (throw, not silently broaden) and the resolveOrgId duplication consolidated to the shared lib export. This is a precondition for lifting the multi-organizer NO-GO.
- **[P2] Persist what registration already collects by using the existing UserProfile model and an order locale** — The registration flow validates and then discards phone/phoneCC and consent fields, and all transactional email hardcodes locale 'en'. UserProfile already has phone, phoneCC, and preferredLocale columns — the model exists, the flow just ignores it. Store the registrant's locale on AttendeeOrder (or link through UserProfile) and read it in approve/reject/markOrderPaid/waitlist instead of the hardcoded 'en'. This is a small structural fix with outsized payoff: it removes the user-hostile mandatory-then-discarded data contract and is the prerequisite for lifting the bilingual NO-GO, since the comms layer can't localize what it never recorded.
- **[P2] Resolve the schema-vs-reality gap: gate, document, or prune the unwired data model** — Roughly a third of the schema (CustomFormField/Answer, ApprovalRule with JSON conditions, full SeatMap/Section/Row hierarchy, ReminderSetting, multi-list check-in, per-ticket waitlist itemId, impersonation flag, BadgePrintLog.reprint, archive() entry point) is present but has no live writer or caller. This is a deliberate roadmap skeleton, but undocumented it will mislead operators about capabilities and the next engineer about what is safe to depend on. Add a single ARCHITECTURE/ROADMAP doc that marks each model 'wired | scaffold | deferred', and for the inert enum variants that affect live logic (ApprovalMode 'automatic' treated as 'none') either wire them or remove them so the type system stops advertising behavior that does not exist.
- **[P3] Establish the deferred-scheduler architecture as a named seam, not scattered orphans** — Four independent capabilities are blocked on the same missing piece: archive cleanup() (14-day purge), waitlist auto-promotion, webhook retryDue(), and reminder offsets. They are each exported, tested, and callerless. Rather than wiring four ad-hoc cron entry points later, define one scheduled-task surface (a single /api/internal/tick route or job runner contract) that these functions register against, so the cron/scheduler roadmap item lands as one operability decision instead of four. Documenting the intended trigger contract now keeps these from rotting into permanently-dead code.

## Verified findings (38)

Findings that survived adversarial (refute-by-default) verification.

| Chunk | Severity | Finding | Location | Detail |
|-------|----------|---------|----------|--------|
| events-calendar | high | updateEvent silently discards the live flag | `apps/web/src/lib/events/service.ts:176-181` | The PATCH call to pretixEvents.updateEvent passes { titleEn, titleAr, date_from } but omits input.live. The 'Live (published in pretix)' checkbox in the edit form (event-form.tsx:114) is therefore a no-op when editing an existing event — clicking Save will never toggle the pretix event's live status. The flag is only honoured at creation time (service.ts:86). Fix: add live: input.live to the patch object passed at line 179. |
| admin-ui | high | Broken nav links cause admin 404s (Registrations, Staff, Settings index) | `apps/web/src/app/[locale]/(admin)/admin/layout.tsx:14-17` | Three entries in the NAV array — 'Registrations' (href /registrations), 'Staff' (href /staff), and 'Settings' (href /settings) — point to routes that have no matching page.tsx. Super-admins and organizer-admins see these links. Clicking them produces a Next.js 404 or, if a catch-all exists, an unrelated page. The 'Staff' link is especially confusing because the staff interface does exist at a different URL (`/(staff)/staff`). These should either be removed from NAV or backed by real pages. |
| auth | medium | active_org cookie missing Secure flag in production | `apps/web/src/lib/auth/active-org.server.ts:53-57` | cookies().set() for the active_org session-switching cookie does not set secure: true in production. The Auth.js config (config.ts:15) correctly enforces useSecureCookies: process.env.NODE_ENV === 'production', but this hand-rolled cookie does not. In production (which requires HTTPS per env.ts:98-100), the cookie will be transmitted over HTTPS anyway, but omitting the Secure attribute means a browser would also send it over plain HTTP to the same host — contradicting the HTTPS-only intent and violating the spirit of the production hardening already applied to the Auth.js cookies. Fix: add secure: process.env.NODE_ENV === 'production' to the set() options. |
| pretix-adapter | medium | pretixSecret is always null at registration time | `apps/web/src/lib/pretix/orders.ts:15 and apps/web/src/lib/registration/service.ts:136` | PretixOrder.positions is typed as optional (positions?: PretixOrderPosition[]). The createOrder call (orders.ts:41) hits POST /orders/ with no ?expand=positions query parameter. pretix does NOT inline positions in the order-create response by default — the positions array is absent. Consequently order.positions?.[0]?.secret is always undefined and pretixSecret is stored as null for every new registration. The check-in service falls back to orderCode (checkin/service.ts:94) so check-in still works, and the QR display also falls back (attendee-state-view.tsx:33). However pretix check-in by per-position secret (which is what the /redeem/ endpoint actually validates against) is the intended flow, and null pretixSecret means the QR encodes the order code rather than the attendee-specific secret, which pretix may not accept depending on its list configuration. Fix: add ?expand=positions to the createOrder URL, or issue a follow-up getOrder call immediately after creation to fetch the secret. |
| registration-approval | medium | phone / phoneCC collected but never persisted — silent data loss | `apps/web/src/lib/registration/schema.ts:11-12, apps/web/src/lib/registration/service.ts:120-139` | The registration schema requires attendee.phoneCC (min 1) and attendee.phone (min 3) and will reject a form submission that omits them. The service.ts prisma.attendeeOrder.create block at line 120 never references data.attendee.phoneCC or data.attendee.phone, and the AttendeeOrder model has no phone columns. Every registration therefore silently drops valid phone data that the attendee was required to supply. Either the schema fields should become optional (if phone is not yet intended to be stored) or the Prisma model needs phone/phoneCC columns. As-is this is a user-hostile data contract: mandatory input that is immediately discarded. |
| seats-waitlist | medium | listWaitlist skips access check when waitlist is empty | `apps/web/src/lib/waitlist/service.ts:56-63` | The canAccessEvent gate only fires when entries[0] exists. If the waitlist is empty, any authenticated session (including a session for an unrelated organisation) that happens to obtain a valid eventMappingId can call listWaitlist and receive [] with no authorisation error. The page-level requireRole guard prevents exploitation via the admin UI, but the function is also called directly from the API route (api/v1/events/[id]/waitlist GET), which has its own withApi/waitlist:read scope check. Should the function ever gain additional callers, the empty-list bypass becomes a real hole. Fix: check canAccessEvent against the eventMapping for the requested eventMappingId unconditionally, not conditionally on having at least one entry. |
| checkin-staff | medium | searchAttendees missing role assertion — any org-member can invoke it | `apps/web/src/lib/checkin/service.ts:44` | checkInOrder calls assertCanCheckin (which blocks finance, impersonators, and any non-checkin role) before proceeding. searchAttendees does not — it only calls resolveEvent, which delegates to canAccessEvent. canAccessEvent grants org-wide access to organizer_admin and finance members. The server action searchAction (actions.ts:12) therefore exposes attendee PII (name, email, orderCode) to any authenticated org member who calls the action directly, bypassing the layout-level requireRole gate. The layout guard protects the rendered page but server actions are callable independently of the UI. Fix: add assertCanCheckin(session) at the top of searchAttendees. |
| events-calendar | medium | Fallback calendar start date silently uses current time when pretix is unreachable | `apps/web/src/app/[locale]/(public)/events/[slug]/page.tsx:43` | When getPublicEvent cannot fetch the pretix event detail, dateFrom is null. The event-detail page then constructs the CalendarEvent with `start: dateFrom ?? new Date().toISOString()`, meaning AddToCalendar and the Google Calendar link will advertise the download moment (today) as the event start time. The same null propagates to the EventHero dateLabel (line 52) which already handles null gracefully, but the calendar widgets do not. This can silently produce incorrect calendar entries without any visible error to the user. Fix: either suppress AddToCalendar when dateFrom is null, or surface a visible warning. |
| events-calendar | medium | listPublicEvents and getPublicEvent do not filter by pretix live flag | `apps/web/src/lib/events/public.ts:31, 45` | Both public queries filter only on the local `visibility='public'` column. They have no awareness of whether the corresponding pretix event has `live:false`. Events created with live:false (the form default) are immediately visible in the public storefront as soon as they are saved with visibility='public'. This means draft/unpublished events leak to the public. Either add a local `liveOnPretix` boolean that is kept in sync by webhook/sync, or always call pretixEvents.getEvent and check the live field before returning — though the latter has a per-request latency cost. At minimum, the admin UI should make this discrepancy visible. |
| integrations-comms | medium | testSmtpAction never exercises the live SMTP transport in production | `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts:29` | The action uses `process.env.NODE_ENV !== 'production'` as its success signal rather than attempting a real send via sendEmail(). In production it unconditionally records ok:false and the misleading error 'No SMTP transport configured' regardless of whether SMTP_HOST is set and working. |
| external-api-v1 | medium | API-key actor not recorded in audit log for write operations | `apps/web/src/app/api/v1/events/[id]/checkins/route.ts:63` | The POST check-in handler writes actorUserId: null to AuditLog with no reference to ctx.keyId. The POST attendees handler delegates to register() which writes no audit log at all. The AuditLog model has no actorApiKeyId column, so there is currently no way to attribute API-key-driven mutations to a specific key in the audit trail. This means a compromised key cannot be traced in post-incident review. Remediation: add an optional actorApiKeyId String? column to AuditLog (schema + migration) and populate ctx.keyId when the action originates from the v1 API. |
| external-api-v1 | medium | MAGIC_LINK_SECRET silently falls back to WEBHOOK_SECRET in production | `apps/web/src/lib/tokens/magic-link.ts:4` | The secret() function reads process.env.MAGIC_LINK_SECRET || process.env.WEBHOOK_SECRET. In production, if MAGIC_LINK_SECRET is absent but WEBHOOK_SECRET is set (its name in the pretix-webhook subsystem is PRETIX_WEBHOOK_SECRET, not WEBHOOK_SECRET, so this branch is likely dead) the fallback silently uses a different secret. More importantly, the env validator in lib/config/env.ts checks MAGIC_LINK_SECRET and PRETIX_WEBHOOK_SECRET independently — it never checks a bare WEBHOOK_SECRET. If an operator sets a bare WEBHOOK_SECRET intending it as the fallback, env.ts will still reject startup for a missing MAGIC_LINK_SECRET. The fallback branch is therefore either unreachable or mis-named, and should be removed so the code and the env validator are consistent. |
| admin-ui | medium | SMTP 'Send test' action always fails in production regardless of SMTP configuration | `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts:30` | `testSmtpAction` resolves `ok` to `process.env.NODE_ENV !== 'production'`, making the value hardcoded `false` in production. It never calls `emailMode()` or attempts to send via the actual SMTP transport, so the test button in production always tells the admin 'SMTP not configured' even when SMTP credentials are present and functional. The button provides false negative feedback and gives operators no way to verify their SMTP settings through the UI. |
| public-ui | medium | Order-code lookup does not scope to the event slug — any valid order code is viewable at any event URL | `apps/web/src/lib/registration/access.ts:4-9` | getOrderByCode() fetches by orderCode alone with no eventMapping filter. Both confirmation/[orderCode]/page.tsx and payment-pending/[orderCode]/page.tsx destructure slug from params but never use it. This means an attacker who has one valid order code can view an attendee's name, event, and approval status from any event slug, and can construct a valid /t/<token> URL from the magic-link token on a different event's confirmation page. The fix is to add eventMapping: { pretixEventSlug: slug } to the findFirst where clause in getOrderByCode, or create a slug-scoped variant used by those pages. |
| cross-cutting | medium | HSTS preload sent when the app may be behind plain HTTP | `apps/web/src/lib/security/headers.ts:44-46` | buildSecurityHeaders emits 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload' whenever isProd=true. The condition is NODE_ENV==='production' (next.config.ts:14), not 'is the connection TLS-terminated'. If an operator deploys without Cloudflare/nginx TLS (the known deferred TLS item), browsers that have previously cached the HSTS header will refuse all future plain-HTTP connections to that hostname for two years. This is a silent footgun: the header itself is correct for a fully TLS-wired deployment, but it should not be emitted unless the operator has confirmed TLS is in place. At minimum the code comment should warn that this header must not be served over plain HTTP; ideally the guard condition should also check APP_URL starts with https://. |
| auth | low | hashPassword exported but seed bypasses it — argon2 parameters can diverge | `apps/web/src/lib/auth/password.ts:10 vs apps/web/prisma/seed.ts:24` | hashPassword() centralises the OWASP-recommended argon2id parameters (memoryCost 19456, timeCost 2, parallelism 1). The seed script imports hash() from @node-rs/argon2 directly and supplies the same constants inline. If the canonical parameters in password.ts are ever tuned, the seed will silently diverge, producing seed accounts with a different cost configuration than normal sign-up accounts. The fix is to import hashPassword() from lib/auth/password in seed.ts. |
| pretix-adapter | low | redeemCheckin second catch branch (PretixError) is unreachable for 400 responses | `apps/web/src/lib/pretix/checkin.ts:63` | client.ts lines 57-65 always throws PretixValidationError (not plain PretixError) when the response status is 400 and the body is a non-array object. The pretix redeem endpoint always returns 400 + {status:'error', reason} on failure, so the second branch (err instanceof PretixError && !(err instanceof PretixValidationError)) can never be reached for redeem errors. The first branch (PretixValidationError) handles it via a double-cast (err.fieldErrors as unknown as {reason?:string}) which works today because pretix places 'reason' at the top level of the 400 body, which client.ts stores in fieldErrors. The dead branch causes no runtime harm but is misleading and the cast silently bypasses type safety — if pretix ever changes the 400 shape the reason extraction would silently fall back to 'redeem_failed' with no diagnostic detail. |
| pretix-adapter | low | NotImplemented is exported but its only callers are the two dead stub modules | `apps/web/src/lib/pretix/errors.ts:25` | NotImplemented extends PretixError and is exported. Its only callers are questions.ts and vouchers.ts, which are themselves unused (see deadCode). If questions/vouchers are eventually removed, NotImplemented becomes a fully orphaned export. Not a runtime risk but worth noting for cleanup. |
| registration-approval | low | approve() / reject() emails always use hardcoded 'en' locale regardless of attendee's registration locale | `apps/web/src/lib/approval/service.ts:109, apps/web/src/lib/approval/service.ts:185` | Both approve() and reject() declare `const locale: Locale = "en"` unconditionally. The AttendeeOrder row does not store the registration locale, so there is no easy fix without a schema change, but the effect is that Arabic-language registrants who registered via locale='ar' will always receive approval/rejection emails in English. This is a localisation gap that will produce confusing comms for Arabic-speaking attendees. |
| registration-approval | low | Decision from detail page does not revalidate the detail route — stale UI after approve/reject | `apps/web/src/app/[locale]/(admin)/admin/approvals/actions.ts:23,38, apps/web/src/app/[locale]/(admin)/admin/approvals/decision-buttons.tsx` | approveAction and rejectAction both call revalidatePath(`/${locale}/admin/approvals`) which covers only the list route. The detail page at `/${locale}/admin/approvals/${orderId}` is not revalidated. When DecisionButtons is used on the detail page (approval detail page renders DecisionButtons at line 58-63), a successful approve/reject leaves the detail page showing the pre-decision state (still 'pending', buttons still visible) until the admin manually refreshes. The fix is either to also call revalidatePath(`/${locale}/admin/approvals/${orderId}`) or to add router.refresh() in DecisionButtons after a successful result. |
| registration-approval | low | registerAction exposes raw internal error messages to the browser | `apps/web/src/app/[locale]/(public)/events/[slug]/register/actions.ts:51-53` | The catch block returns `{ error: (err as Error).message }` directly. Internal errors from pretix (e.g. network failures, API validation responses) or seat-reservation errors will expose potentially sensitive infrastructure details (API endpoint names, pretix error bodies) verbatim to the end-user browser. A generic 'Registration failed, please try again' message should be shown to the user while the raw error is logged server-side. |
| finance-payments | low | Confirmation email hardcodes locale 'en', ignoring attendee's registered locale | `apps/web/src/lib/finance/service.ts:115` | markOrderPaid() constructs the ticket URL and renders the confirmation email with `const locale: Locale = 'en'` regardless of the order's actual locale. The same pattern appears in lib/approval/service.ts:109,185 and lib/waitlist/service.ts:90, so this is a platform-wide hardcoding. An Arabic-speaking registrant who explicitly registered under the 'ar' locale will receive an English email and an English-prefixed ticket URL. Since full Arabic i18n is deferred, this is low severity rather than a regression, but it is a concrete defect within this chunk. |
| finance-payments | low | providers registry includes 'whish' as enabled:false but SelectedProvider type excludes 'whish', creating an internal inconsistency | `apps/web/src/lib/payments/provider.ts:11-21` | The providers registry declares a 'whish' entry (enabled:false), but SelectedProvider is typed as 'free' | 'manual_cod' with no 'whish' variant, and selectProvider() can never return 'whish'. Any future caller that iterates the providers registry and tries to create an order for a provider returned by selectProvider() would need to handle the gap. This is an inconsistency that should be resolved before Whish is wired — either remove the registry entry or align the type — but it has no runtime effect today. |
| seats-waitlist | low | SeatSelector.selectable() diverges from canSelect() for expired holds | `apps/web/src/components/seats/seat-selector.tsx:21-23` | The component's local selectable() returns false for temporarily_held seats regardless of heldUntil. state.ts canSelect() correctly allows selection of an expired temporarily_held seat. The server calls releaseExpiredHolds before sending seat data, so on initial load this is harmless. However, if a hold expires while the wizard is open (within the 10-minute window), the affected seats remain visually amber and unselectable until the user refreshes — they cannot reclaim them in the same session. This is a UX inconsistency; the fix is to replace selectable() with an import of canSelect from state.ts, passing the server-rendered heldUntil timestamp. |
| seats-waitlist | low | promote() does not check whether entry is already promoted | `apps/web/src/lib/waitlist/service.ts:85-88` | promote() runs an unconditional prisma.waitlistEntry.update setting status='promoted' without verifying the current status. Re-promoting an already-promoted entry silently overwrites promotedAt and fires a second webhook event (waitlist.promoted) and sends a second email. The admin UI shows the Promote button only for status='waiting' entries, so this requires either a race or direct API/action calls. A conditional update (updateMany with where: {id, status: 'waiting'}) and a check on count===1 would make it idempotent. |
| checkin-staff | low | listId=0 passed unchecked to pretix when no check-in list is configured | `apps/web/src/app/[locale]/(staff)/staff/checkin/checkin-panel.tsx:32` | When pretix returns no check-in lists, page.tsx sets listId to 0 (line 39) and passes it to CheckinPanel. CheckinPanel passes it directly to checkInAction, and checkInOrder passes it to pretixCheckin.redeemCheckin, constructing a URL with /checkinlists/0/positions/. The page renders a warning banner for this case, but the Check-in button remains active and clickable. The pretix API will return an error that propagates as an opaque 'Check-in failed' or a thrown exception (depending on HTTP status), not the meaningful 'no check-in list configured' message already present in the page. Fix: disable the Check-in button (or the entire panel) when listId === 0, or add a guard in checkInOrder: if (!listId) return { ok: false, reason: 'No check-in list configured' }. |
| checkin-staff | low | Attendee name not included in search — staff cannot search by attendee name | `apps/web/src/lib/checkin/service.ts:53` | searchAttendees builds an OR clause over orderCode and email only. The attendeeName column exists on AttendeeOrder and is used to display the name in search results (checkin-panel.tsx:68) and as the badge fullName. Staff at a physical check-in desk typically search by attendee name. Adding { attendeeName: { contains: query, mode: 'insensitive' } } to the OR clause is straightforward and would match the UI placeholder 'Search name / email / order code'. |
| events-calendar | low | buildIcs uses Math.random() for UID — not cryptographically unique | `apps/web/src/lib/calendar/ics.ts:27` | The VEVENT UID is constructed as `${start}-${Math.random().toString(36).slice(2)}@strawberry`. RFC 5545 §3.8.4.7 requires UIDs to be globally unique. Math.random() provides ~52 bits of entropy in V8 (not crypto-grade) and the UID is re-generated on every download for the same event, meaning calendar clients that rely on stable UIDs for deduplication or update detection will create duplicate entries. Fix: use crypto.randomUUID() (already imported in service.ts) or derive a deterministic UID from the event slug. |
| events-calendar | low | ICS lines are not folded to 75 octets (RFC 5545 §3.1) | `apps/web/src/lib/calendar/ics.ts:19-37` | RFC 5545 mandates that content lines MUST NOT exceed 75 octets (excluding CRLF) and that longer lines be folded with CRLF + SPACE. buildIcs does no folding. Long SUMMARY, DESCRIPTION, or LOCATION values (e.g. a multi-sentence event description) will produce non-conformant .ics files that strict calendar clients (including some mobile importers) may reject or truncate. Fix: add a fold() pass over each line before joining with \r\n. |
| integrations-comms | low | Webhook emit swallows all errors with no logging | `apps/web/src/lib/webhooks/service.ts:91` | The outer try/catch in emit() catches all exceptions and discards them silently with no console.error or log. A database error creating the WebhookDelivery row is undetectable in operations. Adding a single console.error before the closing brace would preserve the fire-and-forget contract while making failures observable. |
| integrations-comms | low | No webhook deletion capability | `apps/web/src/lib/webhooks/admin-service.ts:1` | admin-service.ts provides create, enable/disable, rotate-secret, list, test, and list-deliveries, but no delete operation. An organizer admin cannot remove a misconfigured or obsolete webhook endpoint; they can only disable it, leaving stale rows accumulating indefinitely. |
| external-api-v1 | low | POST /attendees exposes internal registration error messages as 422 detail | `apps/web/src/app/api/v1/events/[id]/attendees/route.ts:58` | The catch block returns (err as Error).message verbatim under the registration_failed code with status 422. Registration errors from the pretix layer (PretixValidationError, PretixError, capacity errors) can contain internal detail that should not be forwarded to API consumers. withApi's top-level catch only covers ApiError; arbitrary thrown errors from register() reach this branch unchecked. Remediation: map known error types (PretixValidationError → validation detail scrubbed, capacity/approval logic → specific v1 codes) and fall back to a generic message for unknown errors. |
| external-api-v1 | low | Null organizationId on key silently disables org isolation in resolveApiEvent | `apps/web/src/lib/api/handler.ts:44` | resolveApiEvent passes organizationId: ctx.organizationId ?? undefined to Prisma. When organizationId is undefined, Prisma omits that filter entirely, letting the key see events from any organization. The application code path (createApiKey in admin-service) always supplies a non-null organizationId, so this is only reachable via a direct DB insert or a future super-admin key feature. The risk is latent but worth an explicit guard: throw ApiError('forbidden_event', ...) when ctx.organizationId is null rather than silently broadening scope. |
| admin-ui | low | Duplicated `resolveOrgId` implementation in api-keys and webhooks pages | `apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/page.tsx:9 and apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/page.tsx:9` | Both pages define an inline `resolveOrgId` function that is identical to the shared export in `lib/admin/resolve-org.ts`. The integrations pages already use the shared version. If the resolution logic ever changes (e.g. to respect an active-org cookie for super-admins), the api-keys and webhooks pages will silently diverge. Should be replaced with `import { resolveOrgId } from '@/lib/admin/resolve-org'`. |
| public-ui | low | Calendar 'Add to Calendar' uses current timestamp as start date when event has no dateFrom | `apps/web/src/app/[locale]/(public)/events/[slug]/page.tsx:43` | The calendar prop is built as start: dateFrom ?? new Date().toISOString(). When pretix returns no date (getEvent() returns null or dateFrom is absent), the ICS and Google Calendar link silently use the moment the page was rendered as the event start time. Users downloading the .ics or clicking 'Add to Google' for an undated event get a broken calendar entry. The AddToCalendar component or the TicketRail should be conditionally hidden when dateFrom is null, or the fallback should be an explicit sentinel that prevents calendar export. |
| public-ui | low | QrCodeDisplay swallows QRCode.toDataURL errors silently, leaving a permanent spinner | `apps/web/src/components/public/qr-code-display.tsx:13` | The .catch(() => {}) means that if qrcode library fails (e.g., invalid input, memory pressure), src remains null forever and the component shows an infinite animate-pulse skeleton. The attendee cannot see their ticket QR. The catch block should set an error state and render a text fallback showing the raw order code or pretixSecret so the attendee can still check in manually. |
| public-ui | low | payment-pending page duplicates AttendeeStateView's pending_payment state with no link to the canonical ticket URL | `apps/web/src/app/[locale]/(public)/events/[slug]/payment-pending/[orderCode]/page.tsx:18-34` | The payment-pending page contains its own hardcoded prose and never shows the magic-link URL or 'View ticket' link. AttendeeStateView already handles the pending_payment state correctly and includes that context. The register action routes COD-without-approval to this page, but the page does not help the user bookmark or access their order later — there is no link to /<locale>/t/<token> or /my-tickets. The order record is created at this point and the magicLinkToken exists, so the page should either use AttendeeStateView (with the fetched order) or add a self-link. |
| cross-cutting | low | audit/service query() has no per-page pagination defence — unbounded take | `apps/web/src/lib/audit/service.ts:88` | filters.take defaults to 100 if not supplied by the caller. The audit list page (admin/audit/page.tsx) passes no take value, so it always fetches up to 100 rows. If an org accumulates thousands of audit entries this becomes a large query. More importantly there is no offset/cursor parameter, so the UI has no way to page through older entries beyond the first 100. This is not a security defect but is a usability/performance gap that will surface as soon as a moderately active org uses the platform. |

## Manager implementation plans (14)

One scoped plan per approved decision. **Plans only — no code written.**

### 1. Remove or back the three 404 admin nav links (Registrations, Staff, Settings)  _(rank 1, UI/UX, effort S)_

- **Files:** `apps/web/src/app/[locale]/(admin)/admin/layout.tsx`
- **Approach:** The entire fix is confined to the NAV array in layout.tsx (lines 10-23). No new files need to be created.

Step 1 — Audit the three offending entries against the filesystem (already done):
- `/registrations` (line 14): no directory at `(admin)/admin/registrations/`, no page.tsx anywhere under admin → pure 404.
- `/staff` (line 16): no directory at `(admin)/admin/staff/`. The real staff UI is the separate route group `(staff)/staff/` (index page.tsx + checkin/page.tsx). The label "Staff" actively sends admins to 404 instead of that working URL → 404 + misdirection.
- `/settings` (line 17): directory `(admin)/admin/settings/` exists but contains only three subdirectories (api-keys, integrations, webhooks) — no settings/page.tsx — so the bare `/settings` href 404s. The three sub-nav entries for those children (lines 18-20) are all live and must be retained unchanged.

Step 2 — Delete exactly three lines from the NAV array:
  - Line 14: `{ href: "/registrations", label: "Registrations", financeAllowed: false },`
  - Line 16: `{ href: "/staff", label: "Staff", financeAllowed: false },`
  - Line 17: `{ href: "/settings", label: "Settings", financeAllowed: false },`
  Retain lines 18-20 (api-keys, webhooks, integrations) verbatim — they point to live routes.

Step 3 — Add a "Check-in" nav entry pointing at the real staff route so admins can navigate to check-in staff tooling:
  Insert `{ href: "", label: "Check-in", financeAllowed: false, external: true }` is NOT the right approach because the staff route is under a different layout group. Instead, add a plain external Link entry or a clearly labelled separator. The simplest correct form: add one new entry to NAV with a fully-qualified path rather than a relative admin path. Because the current nav renders as `/${locale}/admin${n.href}`, the admin route group cannot produce `/${locale}/staff` naturally. Two options — choose one before coding:
    Option A (recommended, zero abstraction): Render the Check-in link separately outside the nav.map() loop, hard-coding `/${locale}/staff` (locale is already in scope). This avoids touching the NAV data shape.
    Option B: Add a boolean flag `staffRoute: true` to the NAV item type and branch inside the Link's href expression. Slightly more flexible but more code churn.
  The plan endorses Option A: after the closing `</nav>` tag in the aside, add a visually distinct "Go to Check-in" link (e.g. with a small icon or separator) pointing to `/${locale}/staff`. This makes the navigation intent unambiguous.

Step 4 — Verify the remaining 9 NAV entries all resolve to live page.tsx files (cross-check already done; Dashboard, Events, Approvals, Finance, API keys, Webhooks, Integrations, Audit, Delete queue — all confirmed present).

Step 5 — No i18n translation keys are referenced for nav labels (they are hardcoded English strings), so no next-intl message files need updating.
- **Tests:** 1. Manual smoke test (critical, must pass before merge):
   - Log in as organizer_admin; verify sidebar shows exactly: Dashboard, Events, Approvals, Finance, API keys, Webhooks, Integrations, Audit, Delete queue, and the new Check-in link.
   - Click each entry; confirm zero 404 responses.
   - Click Check-in; confirm it lands on /(staff)/staff/ (the event list page).
   - Log in as finance role; verify only the financeAllowed subset appears (Dashboard, Finance, Integrations) and the three deleted entries are absent.

2. Automated — add/update an E2E test (Playwright, if the project has one):
   - Locate existing admin nav tests in the e2e suite (search for `admin` + `nav` or `sidebar`). If found, update the expected link list to remove Registrations/Staff/Settings and add Check-in.
   - Assert that navigating to `/{locale}/admin/registrations`, `/{locale}/admin/staff`, and `/{locale}/admin/settings` returns 404 (these should now be explicitly unlinked; the routes themselves don't exist so Next.js will still 404 if typed manually, which is acceptable).

3. Snapshot/unit — if the project snapshots the layout component, update the snapshot to reflect the trimmed NAV array.

4. No API, database, or auth logic changes; no server action tests are needed.
- **Risk:** Blast radius: cosmetic only — one server component, one file, no data layer touched.

Risks:
- Removing "Settings" top-level link: low risk. Sub-entries (api-keys, webhooks, integrations) remain. Any bookmark to `/admin/settings` will continue to 404 (it 404s today too), so no regression.
- Removing "Registrations": low risk. No page exists; no code references this nav entry by href. Search the codebase for any hardcoded `/admin/registrations` links in other components before merging (quick grep; expected result: zero hits).
- Removing "Staff" from admin nav: low risk for navigation, but worth confirming no other component in the (admin) route group links to `/admin/staff` directly.
- Adding the Check-in external link: the `locale` variable is already resolved at the top of the layout function; the href `/${locale}/staff` is safe. The staff route group has its own requireRole guard (super_admin | organizer_admin | checkin_staff), so an admin clicking through will be admitted correctly.

Mitigation: the change is a 3-line deletion + ~3-line addition in a single file. It is trivially revertable with one git revert if anything unexpected surfaces in staging.

### 2. Give QrCodeDisplay a visible text fallback instead of an infinite spinner  _(rank 2, UI/UX, effort S)_

- **Files:** `apps/web/src/components/public/qr-code-display.tsx`, `apps/web/src/components/public/__tests__/qr-code-display.test.tsx`
- **Approach:** 1. **Introduce an error state.** Add a second piece of state alongside `src`: `const [error, setError] = useState(false)`. In the `.catch()` handler (line 15), call `setError(true)` instead of swallowing the error silently.

2. **Add a `loading` discriminator.** Replace the `src | null` pattern with an explicit three-branch render: `loading` (src is null and error is false), `error` (error is true), `ready` (src is a data URL). A simple boolean `loading = !src && !error` derived from the two state booleans is enough — no need for a separate state variable.

3. **Render the text fallback on error.** When `error` is true, render a `<div>` or `<p>` that:
   - Displays the raw `value` prop as selectable monospace text (use `font-mono select-all` or `select-text`).
   - Matches the 220 × 220 footprint of the QR image so the surrounding card in `attendee-state-view.tsx` does not reflow.
   - Includes an accessible label such as "QR code unavailable — use this code at the entrance:" above the value, keeping it useful for an attendee shown the screen.
   - Does NOT expose any internal error detail.

4. **Keep the pulse skeleton for the loading state** exactly as it is today — only swap it out when `error` becomes true.

5. **No prop changes, no caller changes.** `attendee-state-view.tsx` passes `order.pretixSecret ?? order.orderCode` — this is already the right human-readable fallback value. `badge-template.tsx` passes `badge.qrValue`. Both callers already supply a meaningful string, so the component needs no new props.

6. **Add a `data-testid` attribute** to both the error fallback container and the success `<img>` to make future assertions explicit without relying on role heuristics in a Node test environment.

7. **Create the test file** `apps/web/src/components/public/__tests__/qr-code-display.test.tsx` (the existing include glob `src/**/*.{test,spec}.{ts,tsx}` will pick it up). Because `vitest.config.mts` sets `environment: "node"` globally and the `qrcode` library works in Node, the test can mock `qrcode` at the module boundary without jsdom. If React rendering assertions are desired, add a per-file `@vitest-environment jsdom` docblock or configure a project-level override for `components/**` — the plan should note this choice must be made at implementation time. The simplest approach is to add `// @vitest-environment jsdom` at the top of the new test file, which Vitest v1+ honours without config changes.

8. **No i18n keys needed now.** The fallback strings are short, English-only, and attendee-facing. If i18n is required later it is a separate ticket. The plan explicitly defers this to avoid scope creep.

- **Tests:** New file: `apps/web/src/components/public/__tests__/qr-code-display.test.tsx`

Add `// @vitest-environment jsdom` at the top of the file (Vitest per-file environment override).

**Test cases to add:**

- **Loading state:** mock `qrcode` to return a promise that never resolves; render `<QrCodeDisplay value="TEST-001" />`; assert the pulse skeleton `div` is in the document and the `<img>` and error fallback are absent.

- **Success state:** mock `qrcode.toDataURL` to resolve with `"data:image/png;base64,abc"`; render the component; wait for the `<img data-testid="qr-image">` to appear; assert its `src` equals the mocked data URL and the pulse skeleton and error fallback are absent.

- **Error state — primary case:** mock `qrcode.toDataURL` to reject with `new Error("Canvas not available")`; render `<QrCodeDisplay value="ABCD-1234" />`; wait for the error fallback `[data-testid="qr-fallback"]` to appear; assert the raw value `"ABCD-1234"` is present as text content; assert the `<img>` is absent; assert the container has the expected 220 × 220 sizing class (or at minimum is non-empty).

- **Error state — pretixSecret value propagates correctly:** same setup as above with `value="PRETIX-SECRET-XYZ"`; assert that string appears verbatim in the fallback, confirming callers do not need to change.

- **Cleanup / no state leak:** render twice with different values; assert only the second value appears after re-render (guards against the `active` flag cleanup path).

No changes are required to existing test files. No integration or e2e tests are needed for this change — the failure mode is a pure client-side React state branch with no server interaction.

- **Risk:** **Blast radius: minimal.** The change is confined to a single 26-line client component. There are exactly two call sites:

- `attendee-state-view.tsx` line 33 — attendee ticket page (public-facing, P0 surface).
- `badge-template.tsx` line 33 — admin badge print dialog (staff-facing, lower urgency).

Neither caller changes. The error fallback is only rendered when `QRCode.toDataURL` rejects, which does not happen in the happy path. The pulse skeleton and the success `<img>` are completely unaffected.

**Edge cases to mitigate:**

- **Canvas availability:** the `qrcode` npm package calls `document.createElement('canvas')` in browser environments; in SSR it will throw. The component is already marked `"use client"` and the `useEffect` ensures the call only happens client-side, so this is not a new risk.
- **Empty or very long value strings:** the error fallback renders the raw `value` prop, which can be up to ~64 characters for a pretixSecret. Use `break-all` and `word-break: break-all` CSS to prevent overflow inside the 220 × 220 container.
- **Accessibility:** add `role="alert"` to the error fallback div so screen readers announce it when it mounts.
- **Print / badge context:** `badge-template.tsx` embeds inline print CSS at 4 × 6 inches. If the QR errors there, the 220 × 220 fallback box will still fit within the badge layout. No print-CSS changes needed.

**Mitigation:** the change can be deployed behind no feature flag because the error branch was previously unreachable-yet-broken (infinite skeleton). Making the broken path slightly more visible carries zero regression risk to the working path.


### 3. Scope order-code lookup to the event slug (fix horizontal IDOR / PII + token exposure)  _(rank 3, Cybersecurity, effort S)_

- **Files:** `apps/web/src/lib/registration/access.ts`, `apps/web/src/app/[locale]/(public)/events/[slug]/confirmation/[orderCode]/page.tsx`, `apps/web/src/app/[locale]/(public)/events/[slug]/payment-pending/[orderCode]/page.tsx`, `apps/web/src/lib/registration/__tests__/service.test.ts`, `apps/web/src/lib/registration/__tests__/register.integration.test.ts`
- **Approach:** 
**Background — what the code actually looks like**

`access.ts` exports two functions: `getOrderByCode(orderCode)` issues `prisma.attendeeOrder.findFirst({ where: { orderCode } })` and `getOrderByToken(token)` decodes the magic-link and calls `getOrderByCode`. The schema already carries a composite index `@@index([eventMappingId, orderCode])` on `AttendeeOrder` and a `@@unique([pretixOrganizerSlug, pretixEventSlug])` on `EventMapping`. The two public pages (`confirmation` and `payment-pending`) receive `slug` from the URL params but never forward it to the data layer. The magic-link page `/t/[token]` has no slug in its URL — it is the intentional slug-free path and must stay that way.

**Step 1 — Extend `getOrderByCode` to accept an optional event slug**

Change the signature of `getOrderByCode` to `getOrderByCode(orderCode: string, pretixEventSlug?: string)`. When `pretixEventSlug` is supplied, add `eventMapping: { pretixEventSlug }` inside the `where` clause (Prisma relation filter on the already-joined `include: { eventMapping: true }` is fine; alternatively use a nested `eventMappingId` sub-select, but the relation filter is cleaner and avoids a second query). The composite index `[eventMappingId, orderCode]` that already exists in the schema means the DB will resolve the join-filter cheaply. The function body becomes roughly:

```
where: {
  orderCode,
  ...(pretixEventSlug ? { eventMapping: { pretixEventSlug } } : {}),
}
```

No schema migration is required — no new column or index is needed because `@@index([eventMappingId, orderCode])` already covers this query plan.

**Step 2 — Pass `slug` from the confirmation page**

In `apps/web/src/app/[locale]/(public)/events/[slug]/confirmation/[orderCode]/page.tsx`, destructure `slug` from `params` (it is already in the `Promise<{ locale; slug; orderCode }>` type but was being ignored). Forward it to `getOrderByCode(orderCode, slug)`.

**Step 3 — Pass `slug` from the payment-pending page**

Same change in `apps/web/src/app/[locale]/(public)/events/[slug]/payment-pending/[orderCode]/page.tsx`. Destructure `slug` and pass it as the second argument.

**Step 4 — Leave `getOrderByToken` and the `/t/[token]` page unchanged**

The magic-link token page intentionally has no slug; it is the shareable, cross-device link. It calls `getOrderByToken` which calls `getOrderByCode` without a slug, and that remains a valid, unscoped lookup. The IDOR attack vector requires knowing a raw order code plus navigating to someone else's event slug — not possible via the signed magic-link path, which is already HMAC-protected.

**Step 5 — Update the exported type / JSDoc**

Add a brief JSDoc comment to `getOrderByCode` stating that callers who have the event slug in scope MUST pass it as the second argument to prevent cross-event order lookup.

- **Tests:** 
**Unit tests — `apps/web/src/lib/registration/__tests__/service.test.ts` (or a new sibling `access.test.ts`)**

Add a dedicated test file `apps/web/src/lib/registration/__tests__/access.test.ts` that mocks `prisma.attendeeOrder.findFirst`:

1. `getOrderByCode(code)` without slug — verify the mock is called with `where: { orderCode: code }` and no `eventMapping` key (backward-compat path used by the token page).
2. `getOrderByCode(code, slug)` with a matching slug — verify `where` includes `eventMapping: { pretixEventSlug: slug }`.
3. `getOrderByCode(code, slug)` where the mock returns `null` — verify the function returns `null` (simulates cross-event probe; caller gets notFound() in the page).
4. `getOrderByToken(token)` with a valid HMAC token — verify it decodes and calls `getOrderByCode` without a slug (no regression to the token path).
5. `getOrderByToken(tampered)` — verify it returns `null` without hitting the DB (regression guard on the existing behavior).

**Integration test addition — `apps/web/src/lib/registration/__tests__/register.integration.test.ts`**

In the existing integration suite, after the "COD ticket writes a pending AttendeeOrder" test, add a cross-event IDOR probe:

- Create a second `EventMapping` with a different `pretixEventSlug` in `beforeAll`.
- After the COD registration, call `getOrderByCode(res.orderCode, secondEventSlug)` and assert it returns `null`.
- Also assert `getOrderByCode(res.orderCode, correctSlug)` returns the order with the correct `eventMappingId`.

**No changes needed to the existing page-level tests** — those are render tests that mock the data layer; the page signature change (slug passing) is covered by the unit tests above.

- **Risk:** 
**Blast radius:** Confined entirely to `access.ts` (3 lines changed) and two page files (1 line each — destructure + pass `slug`). No schema migration, no new DB index, no API surface change, no effect on the admin or staff paths.

**Regression risks:**

1. The `/t/[token]` magic-link page calls `getOrderByCode` without a slug. Making the second argument optional (`pretixEventSlug?: string`) means this path continues to work with no change. Risk: none.
2. Pretix event slugs in the URL vs. in the DB must match exactly. They are written to `EventMapping.pretixEventSlug` by the admin event-creation flow and are already used as a lookup key in `register()` (`where: { pretixEventSlug: data.eventSlug }`), so the casing/format is consistent. Risk: very low; mitigated by the integration test asserting exact match.
3. The composite DB index `@@index([eventMappingId, orderCode])` filters by `eventMappingId`, not `pretixEventSlug`. Prisma's relation filter translates `eventMapping: { pretixEventSlug }` into a JOIN against `event_mappings`. The query planner will likely use the index on `EventMapping.@@unique([pretixOrganizerSlug, pretixEventSlug])` to find the mapping ID, then the composite index to find the order. Performance impact is negligible; both indexes exist. Risk: none.
4. If an organizer reuses a pretix event slug across organizers (different `pretixOrganizerSlug`), a strict filter on `pretixEventSlug` alone could theoretically match the wrong mapping. The `@@unique([pretixOrganizerSlug, pretixEventSlug])` constraint prevents this at the DB level. However, the URL slug used in the app is `EventMapping.localEventId` (public-facing `[slug]`), not `pretixEventSlug`. Confirm whether the URL `[slug]` param maps to `localEventId` or to `pretixEventSlug` — look at how `events/[slug]/page.tsx` queries the event. If it uses `localEventId`, the `where` clause in `getOrderByCode` should filter on `eventMapping: { localEventId: slug }` instead of `pretixEventSlug`. This is the only detail that must be verified before writing the code.

**Mitigation for risk 4 (highest priority pre-implementation check):** Read `apps/web/src/app/[locale]/(public)/events/[slug]/page.tsx` and `apps/web/src/lib/events/public.ts` to confirm which column the `[slug]` route param resolves against, then use that same column in the `getOrderByCode` filter. The plan above uses `pretixEventSlug` as stated in the change description; confirm it matches the actual routing column before touching `access.ts`.


### 4. Add a role assertion to searchAttendees to stop finance-role PII access  _(rank 4, Cybersecurity, effort S)_

- **Files:** `apps/web/src/lib/checkin/service.ts`, `apps/web/src/lib/checkin/__tests__/service.test.ts`
- **Approach:** **Step 1 — Add the guard call in service.ts (line 44 area)**

In `searchAttendees`, insert a call to `assertCanCheckin(session)` as the very first statement of the function body, before the `resolveEvent` call. This mirrors the identical pattern already used in `checkInOrder` (line 73). The `assertCanCheckin` helper is already defined in the same file (lines 23–30); it throws `ForbiddenError` when the caller is impersonating or lacks the `checkin_staff` or `organizer_admin` role.

After the change the function body reads:
```
assertCanCheckin(session);
const mapping = await resolveEvent(session, eventId);
return prisma.attendeeOrder.findMany(...)
```

No other files need to change. The server action `searchAction` in `actions.ts` already propagates thrown errors back to the caller — a `ForbiddenError` will surface as a rejected promise / 500 from the server action endpoint, which is the correct behavior.

**Step 2 — No layout or middleware changes needed**

The layout-level `requireRole` guard is defence-in-depth for the UI; the real enforcement must live in the service layer, which is what this fix achieves. Do not remove or weaken the layout guard — leave it as-is.

**Step 3 — Verify no other callers of searchAttendees exist**

Run `grep -r "searchAttendees" apps/web/src` to confirm the function is only called from `actions.ts`. If any additional caller surfaces, evaluate whether it also needs the guard (it likely does, following the same pattern).
- **Tests:** **In `apps/web/src/lib/checkin/__tests__/service.test.ts`**

The `finance` session fixture is already defined (lines 29–33) and the `searchAttendees` export is currently not imported. Add the following test cases to a new `describe("searchAttendees")` block:

1. **Finance role is rejected** — call `searchAttendees(finance, "e1", "ABC")` and assert it rejects with a `ForbiddenError` (or at minimum `.rejects.toThrow()`). The Prisma `findMany` mock must NOT be called.

2. **Impersonating session is rejected** — call `searchAttendees({ ...staff, impersonating: true }, "e1", "ABC")` and assert it rejects. Again `findMany` must NOT be called.

3. **checkin_staff succeeds** — call `searchAttendees(staff, "e1", "ABC")` with `prisma.attendeeOrder.findMany` mocked to return a sample row; assert it resolves to that row array and `findMany` was called once.

4. **organizer_admin succeeds** — same as above with an `organizer_admin` session context, verifying that role is also permitted.

The existing `beforeEach` block already sets up the `eventMapping.findUnique` mock correctly, so test cases 3 and 4 need only mock `attendeeOrder.findMany` (which is already in the mock factory at line 8).

No integration test changes are required because the integration suite tests `checkInOrder` only, and the role guard is a pure logic test that does not require a real database.
- **Risk:** **Blast radius: minimal and contained.**

The only change is one line added to one function. No schema migrations, no new modules, no API surface changes.

**Who is affected:**
- Finance members who were previously able to call `searchAction` directly will now receive a `ForbiddenError`. They cannot reach the check-in page in the UI (the layout already blocks them), so this only affects direct server-action invocations — which are the attack surface being closed.
- `checkin_staff` and `organizer_admin` sessions are entirely unaffected; `assertCanCheckin` passes them through.
- Super-admin sessions are unaffected; `hasAnyRole` short-circuits to `true` for `isSuperAdmin`.

**Mitigation if something goes wrong:**
- The change is a single-line insertion of an already-tested, already-used helper. Rollback is trivially reversible.
- The existing `checkInOrder` test suite already proves `assertCanCheckin` behaves correctly under finance and impersonation sessions, so there is no new logic to introduce bugs.
- No data is written; `searchAttendees` is a read path, so there is no risk of corrupted records.

### 5. Persist phone + consent (use existing UserProfile columns) and link real Terms/Privacy  _(rank 5, Program architecture, effort S)_

- **Files:** `apps/web/prisma/schema.prisma`, `apps/web/prisma/migrations/<timestamp>_add_phone_consent_to_attendee_order/migration.sql`, `apps/web/src/lib/registration/service.ts`, `apps/web/src/lib/registration/schema.ts`, `apps/web/src/components/registration/registration-wizard.tsx`, `apps/web/src/app/[locale]/(public)/events/[slug]/register/actions.ts`, `apps/web/src/lib/registration/__tests__/service.test.ts`, `apps/web/src/lib/registration/__tests__/register.integration.test.ts`
- **Approach:** 
## Diagnosis recap (verified from code)

- `AttendeeOrder` (schema.prisma lines 634-662): has `email`, `attendeeName`, `company` but NO `phone`, `phoneCC`, or `consentAt` columns.
- `UserProfile` (lines 216-229): already has `phone` and `phoneCC` — the architect is correct, this is a flow-side omission.
- `service.ts` lines 120-139: `prisma.attendeeOrder.create` writes 12 fields; `phone`, `phoneCC`, and any consent timestamp are absent.
- `schema.ts` lines 11-13 and 19-20: `phoneCC`/`phone` are `z.string().min(1)` hard-required; `consentTerms`/`consentPrivacy` are `z.literal(true)`. The Zod schema validates these but the service never writes them.
- `registration-wizard.tsx` lines 241/249: consent labels are plain text — no `<a>` elements; Terms/Privacy pages do not exist in the route tree.

## Step-by-step plan

### Step 1 — Prisma schema: add three columns to `AttendeeOrder`

In `apps/web/prisma/schema.prisma`, inside the `AttendeeOrder` model add:

```
  phone      String?
  phoneCC    String?
  consentAt  DateTime?
```

`phone`/`phoneCC` are nullable because the columns must be added to existing rows without backfilling. `consentAt` is nullable for the same reason, but the service will always write `new Date()` for new registrations. Do not change any other model.

### Step 2 — Generate the migration

Run `prisma migrate dev --name add_phone_consent_to_attendee_order`. This produces a single `ALTER TABLE attendee_orders ADD COLUMN ...` migration — additive only, no destructive changes, no default backfill required on the Postgres side.

### Step 3 — service.ts: write the three fields

In `apps/web/src/lib/registration/service.ts`, inside the `prisma.attendeeOrder.create({ data: { ... } })` block (lines 120-138), add after `company`:

```
phone:     data.attendee.phone,
phoneCC:   data.attendee.phoneCC,
consentAt: new Date(),
```

`consentAt` captures a server-side timestamp the moment the create call executes — independent of the client clock, auditable.

### Step 4 — Upsert UserProfile when userId is present

Still in `service.ts`, immediately after the `attendeeOrder.create` call, add a conditional block:

```
if (data.userId) {
  await prisma.userProfile.upsert({
    where: { userId: data.userId },
    update: { phone: data.attendee.phone, phoneCC: data.attendee.phoneCC, preferredLocale: data.locale },
    create: { userId: data.userId, phone: data.attendee.phone, phoneCC: data.attendee.phoneCC, preferredLocale: data.locale },
  });
}
```

This satisfies the architect's requirement to use the existing `UserProfile.phone`/`phoneCC` columns and also keeps the profile locale in sync. Because it runs after the order is committed in the same async context, a failure here should be caught separately and not rolled back the order — wrap in a try/catch that logs but does not re-throw (mirror the email error-swallowing pattern at lines 147-159).

### Step 5 — Create stub Terms and Privacy pages

Create two minimal static pages. These exist purely so links are real and crawlable:

- `apps/web/src/app/[locale]/(public)/legal/terms/page.tsx` — renders a placeholder heading + body ("Terms and Conditions — full text coming soon") with appropriate meta title.
- `apps/web/src/app/[locale]/(public)/legal/privacy/page.tsx` — same pattern for Privacy Policy.

The `[locale]/(public)` group already has a layout. No new layout file is needed. These pages intentionally contain placeholder text, but real hrefs that resolve is what removes the consent-audit hazard.

### Step 6 — Wire links in the wizard

In `apps/web/src/components/registration/registration-wizard.tsx`, replace the two plain-text labels (lines 235-249) with anchor-bearing labels:

- "I agree to the" + `<a href="/{locale}/legal/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>`
- "I agree to the" + `<a href="/{locale}/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>`

`locale` is already a prop passed to the wizard (line 23). Pass it through to the JSX for the links.

### Step 7 — No schema.ts changes needed

`registerInputSchema` already validates `phone`, `phoneCC`, `consentTerms`, `consentPrivacy` correctly. No Zod changes are required.

### Step 8 — No actions.ts changes needed

`actions.ts` passes `parsed.data` straight through to `register()`. The new service fields are downstream; no action-layer change is required.

- **Tests:** 
**Unit test: `service.test.ts`**

The mock for `prisma.attendeeOrder.create` captures the `data` argument. Add assertions to the existing "free event" and "COD event" tests:

```
const data = mock(prisma.attendeeOrder.create).mock.calls[0][0].data;
expect(data.phone).toBe("70123456");
expect(data.phoneCC).toBe("+961");
expect(data.consentAt).toBeInstanceOf(Date);
```

Add a new test: "upserts UserProfile when userId is present" — mock `prisma.userProfile.upsert`, call `register` with `userId: "u1"` in the input, assert the upsert was called with `{ where: { userId: "u1" }, update: { phone: "70123456", phoneCC: "+961", ... } }`.

Add a new test: "skips UserProfile upsert when userId is absent" — call with `userId: undefined`, assert `prisma.userProfile.upsert` was NOT called. You will need to add `userProfile: { upsert: vi.fn() }` to the prisma mock factory.

**Integration test: `register.integration.test.ts`**

After `const row = await prisma.attendeeOrder.findFirst(...)`, add:

```
expect(row?.phone).toBe("70123456");
expect(row?.phoneCC).toBe("+961");
expect(row?.consentAt).toBeInstanceOf(Date);
```

This validates the real Postgres column write against `TEST_DATABASE_URL`.

**No wizard component tests exist** — no new component tests are required by this plan; the link hrefs are verifiable in review.

- **Risk:** 
**Blast radius: narrow and additive**

- The migration is three `ADD COLUMN` statements with nullable types and no default. Zero risk of data loss or row locking beyond a brief schema lock on an empty-ish dev table. On a production table with existing rows, all existing rows silently get `NULL` for the new columns, which is correct and expected.

- The `attendeeOrder.create` change is a pure field addition. Existing callers (`registerAction`) pass the same data shape through; no caller is broken.

- The `UserProfile.upsert` block is wrapped in try/catch (same as email), so a profile-write failure cannot roll back a registration. The upsert uses `userId` as the unique key, which already has a `@@unique` constraint in the schema — no constraint violation risk.

- The two new `/legal/*` pages are additive routes with no effect on existing pages.

- The wizard change replaces text nodes with anchor elements. No state logic changes; no new props required beyond `locale` which is already threaded through.

**Mitigations**

- Run `prisma migrate dev` locally against the test DB before pushing. The migration preview will confirm three `ALTER TABLE` statements and nothing else.
- The integration test (`TEST_DATABASE_URL`) validates the column round-trip before merge.
- The `consentAt` column is server-side (`new Date()` in service.ts), so it cannot be spoofed by a client submitting a crafted payload.
- If a future GDPR audit requires storing the exact policy version the user consented to, add a `consentPolicyVersion String?` column in a follow-up; this plan creates the `consentAt` timestamp anchor that makes that extension trivial.


### 6. Implement the inbound pretix webhook reconciliation path (order.paid/canceled/checkin)  _(rank 6, Program architecture, effort M)_

- **Files:** `apps/web/src/lib/pretix/webhooks.ts`, `apps/web/src/lib/pretix/handlers/order-paid.ts`, `apps/web/src/lib/pretix/handlers/order-canceled.ts`, `apps/web/src/lib/pretix/handlers/checkin-created.ts`, `apps/web/src/lib/pretix/handlers/index.ts`, `apps/web/src/app/api/webhooks/pretix/route.ts`, `apps/web/src/lib/pretix/__tests__/handlers.test.ts`, `apps/web/src/lib/pretix/__tests__/webhooks.test.ts`
- **Approach:** **Step 1 — Extend the webhook type contract in `lib/pretix/webhooks.ts`**

The `PretixWebhookEvent` interface carries `action`, `organizer`, `event?`, and `code?`. Pretix sends action strings of the form `pretix.event.order.paid`, `pretix.event.order.canceled`, and `pretix.event.checkin.created`. Narrow the interface with a typed union discriminant:

```
export type PretixAction =
  | "pretix.event.order.paid"
  | "pretix.event.order.canceled"
  | "pretix.event.checkin.created"
  | string;   // catchall so future actions do not throw
```

Replace `action: string` with `action: PretixAction`. Also assert that `organizer` and `event` (the pretix event slug) are non-empty before returning, throwing `PretixError(400)` if either is absent — `code` is already optional for list-scoped events but is required for all three actionable events, so add a validated overload: handlers can assert code is present by the time they need it. No schema changes, no migration.

---

**Step 2 — Create `lib/pretix/handlers/order-paid.ts`**

This is the heaviest handler. Its contract: given `{ organizerSlug, pretixEventSlug, orderCode }`, reconcile the platform's `AttendeeOrder` to `status = paid` and, if the order is not already issued, issue the confirmation email + platform webhook events.

Idempotency gate: open a Prisma transaction that does `findUnique` on `{ eventMappingId, orderCode }` indexed by the existing `@@index([eventMappingId, orderCode])`. If `status` is already `"paid"` — return immediately (already reconciled). If the row does not exist at all — log a warning and return (pretix knows about an order the platform does not; skip-and-log is safe because the row may not exist yet if the order was created directly in pretix, outside the registration flow). 

For orders that exist and are `pending`:
1. Fetch the pretix order via `getOrder(organizerSlug, pretixEventSlug, orderCode, token)` to get position secrets. This retires the "always-null pretixSecret" problem (dev P2) — pull `positions?.[0]?.secret` and `upsert` it into `pretixSecret` in the same transaction.
2. Atomic update: `updateMany({ where: { orderCode, status: "pending" }, data: { status: "paid", pretixSecret: secret ?? undefined } })`. Using `updateMany` instead of `update` makes the compare-and-set idempotent under concurrent delivery.
3. Check `approvalStatus`. If it is `"pending"` (manual approval required, payment arrived before admin decision): set `status = "paid"` but leave `approvalStatus = "pending"` — the admin still needs to approve. Do NOT emit `ticket.issued` yet (matches existing `approve()` path in `lib/approval/service.ts`).
4. If `approvalStatus` is `"not_required"` or `"approved"`: emit `order.paid` and `ticket.issued` via the existing `emit()` in `lib/webhooks/service.ts`, send the confirmation email (re-use `confirmationEmail` template from `lib/email/templates.ts`), generate/verify the `magicLinkToken` (already stored at order creation — do not re-issue, just use what is on the row).

No new Prisma models required. No migration.

---

**Step 3 — Create `lib/pretix/handlers/order-canceled.ts`**

Given `{ organizerSlug, pretixEventSlug, orderCode }`:
1. `findUnique` by `orderCode`. If absent or already `canceled` — return (idempotent).
2. Atomic `updateMany({ where: { orderCode, status: { not: "canceled" } }, data: { status: "canceled" } })`. If `count === 0` — another concurrent delivery won; return.
3. Call `releaseSeats(orderCode)` from `lib/seats/service.ts` (already handles the no-seats case gracefully via `updateMany`).
4. Emit `seat.released` platform webhook via `emit()`.
5. Do NOT send a cancellation email at this stage (cancellation emails are already sent by the `reject()` path in `lib/approval/service.ts`; a pretix-originated cancel may or may not need one — mark with a TODO noting this is a product decision outside P0 scope).

---

**Step 4 — Create `lib/pretix/handlers/checkin-created.ts`**

This is the pretixSCAN reconciliation path. The platform's `checkInOrder()` in `lib/checkin/service.ts` already calls `redeemCheckin` and logs `BadgePrintLog` — that covers the staff check-in station. The webhook handler covers the reverse: a scan happened in pretixSCAN (mobile app) outside the platform.

Given `{ organizerSlug, pretixEventSlug, orderCode }`:
1. `findFirst` the `AttendeeOrder` by `orderCode`. If absent — skip.
2. Check eligibility via `checkinEligibility(order)`. If not ok — log and skip (pretix is source of truth for actual gate admission; the platform just reconciles its state).
3. Create a `BadgePrintLog` with `reprint: false` (or `true` if one already exists for this `orderCode` today — check with a count query). Set `printedByUserId: null` (system, not a staff session).
4. Create an `AuditLog` entry with `action: "attendee.checked_in"`, `actorUserId: null`.
5. Emit `checkin.created` platform webhook.

The platform does not re-call `redeemCheckin` here — pretix already performed the check-in; calling redeem again would get `already_redeemed`.

---

**Step 5 — Create `lib/pretix/handlers/index.ts` (typed dispatcher)**

Export a single `dispatch(event: PretixWebhookEvent): Promise<void>` function. It resolves the `EventMapping` row by `{ pretixOrganizerSlug: event.organizer, pretixEventSlug: event.event }` (using the existing `@@unique` index on that pair), then the `Organization` for `resolvePretixContext`. If either is absent — log and return (unknown event slug; do not 500, to avoid pretix treating delivery as failed and retrying endlessly).

Switch on `event.action`:
- `"pretix.event.order.paid"` → `handleOrderPaid({ ...ctx, orderCode })`
- `"pretix.event.order.canceled"` → `handleOrderCanceled({ ...ctx, orderCode })`
- `"pretix.event.checkin.created"` → `handleCheckinCreated({ ...ctx, orderCode })`
- default → `console.info("[pretix-webhook] unhandled action", event.action)` then return

All three handlers are called with the resolved `organizerSlug`, `pretixEventSlug`, `orderCode`, and `token`. `orderCode` guards: if `event.code` is absent for any of the three actionable events, log-and-return rather than throw (so pretix does not retry).

---

**Step 6 — Replace the stub in `app/api/webhooks/pretix/route.ts`**

Remove the `console.info` stub. After `verifyWebhook` succeeds, call `await dispatch(event)` imported from `lib/pretix/handlers/index.ts`. Wrap in a try/catch: any error becomes a `500` response so pretix knows delivery failed and will retry. The comment about browser auto-print should be updated to reflect the actual reconciliation behavior; the outdated "pretix remains source of truth — counters are read live" rationale should be updated to "pretix is source of truth; this endpoint reconciles platform state on order payment, cancellation, and check-in."

Return `200 { ok: true }` only after `dispatch` resolves without error. This is intentional — it gives pretix accurate delivery-failure signals for its retry logic.

---

**Step 7 — Idempotency review**

Each handler uses `updateMany` with a state-guard in the `where` clause (e.g. `status: { not: "canceled" }` or `status: "pending"`). Postgres's row-level locking within `updateMany` makes concurrent duplicate deliveries safe: the second call finds `count === 0` and exits cleanly. No additional deduplication table is needed at this scale, but the design can be extended to a `ProcessedWebhookEvent` table later if volume demands it (flagged as a TODO in `handlers/index.ts`).
- **Tests:** **1. Unit tests for each handler — add to `lib/pretix/__tests__/handlers.test.ts` (new file)**

Use Vitest + `vi.mock`. Mock `@/lib/db/client` (prisma), `@/lib/pretix/orders` (getOrder), `@/lib/seats/service` (releaseSeats), `@/lib/webhooks/service` (emit), `@/lib/email/service` (sendEmail), `@/lib/pretix/context` (resolvePretixContext).

For `handleOrderPaid`:
- Paid order that is already `status: "paid"` → returns without calling `updateMany` again (verify mock call count).
- Order absent → returns without error.
- Pending order, `approvalStatus: "not_required"` → `updateMany` called with correct where/data, `emit("order.paid")` and `emit("ticket.issued")` called, `sendEmail` called.
- Pending order, `approvalStatus: "pending"` (approval required, payment arrived first) → `updateMany` called, `emit` NOT called for `ticket.issued`, `sendEmail` NOT called with confirmation template.
- `getOrder` call populates `pretixSecret` from `positions[0].secret` into the update data.
- `getOrder` throwing a `PretixError` → the handler surfaces the error (so the route returns 500 and pretix retries).

For `handleOrderCanceled`:
- Already canceled order → returns idempotently.
- Absent order → returns without error.
- Live order → `updateMany` called, `releaseSeats(orderCode)` called, `emit("seat.released")` called.
- `releaseSeats` throwing → error propagates (so pretix retries).

For `handleCheckinCreated`:
- Order not found → returns without error.
- Order with `status: "pending"` (not eligible) → no `BadgePrintLog` created.
- Issued order (status `"paid"`, approvalStatus `"not_required"`) → `BadgePrintLog` and `AuditLog` created, `emit("checkin.created")` called.
- Duplicate checkin webhook (second delivery, `BadgePrintLog` already exists today) → `reprint: true` on second log.

For `dispatch` (in `handlers/index.ts`):
- Unrecognized `event.event` slug (no matching `EventMapping`) → returns without error (no throw).
- Missing `code` on a paid event → returns without error.
- Routes to correct handler by `action`.

**2. Extend `lib/pretix/__tests__/webhooks.test.ts`** (existing file)

Add a test that verifies `verifyWebhook` rejects a payload where `organizer` is absent, since the new validation now throws on empty organizer.

**3. Integration smoke in `lib/__tests__/smoke.test.ts`** (existing file)

Add a case that imports `dispatch` and calls it with a mocked DB — verifies the module resolves without import-time errors (catches barrel-import mistakes).

**4. Route handler test** (add to or alongside `lib/pretix/__tests__/handlers.test.ts`)

Mock `verifyWebhook` and `dispatch`. Verify:
- Valid request → `dispatch` called once, response is `200 { ok: true }`.
- `verifyWebhook` throwing → `401` returned, `dispatch` not called.
- `dispatch` throwing → `500` returned.

All tests run under the existing Vitest config (`vitest.config.mts`) with no config changes needed.
- **Risk:** **Blast radius: contained but load-bearing.**

The three surfaces touched are:
1. The webhook route (currently a no-op stub — any change is an improvement over silent discard).
2. `AttendeeOrder.status` updates (same `updateMany` pattern already used in `approval/service.ts` and `registration/service.ts`; low novelty risk).
3. `SeatAssignment` state via the already-tested `releaseSeats()` (no changes to seat service, only a new caller).

**Specific risks and mitigations:**

- **Duplicate delivery / double-state-transition:** Mitigated by `updateMany` with state guard in `where` clause. If pretix delivers the same event twice, the second `updateMany` returns `count: 0` and the handler exits cleanly. Document the upgrade path to a `ProcessedWebhookEvent` deduplication table as a TODO.

- **pretix `getOrder` call on every `order.paid` delivery adds a pretix API round-trip inside the webhook request.** If pretix is slow, the webhook handler may exceed its timeout and pretix marks delivery failed, triggering a retry (which calls `getOrder` again). Mitigation: `getOrder` is only called when `status` is not already `"paid"` (the fast idempotency path skips it). The retry is safe because the handler is idempotent.

- **Missing `code` in webhook payload:** Some pretix webhook actions (e.g. `pretix.event.quota.changed`) do not include `code`. The dispatcher guards this and skips without error. For the three handled actions, `code` is always present per pretix docs, but the guard prevents a crash if pretix ever changes payload shape.

- **Order absent in platform DB (created directly in pretix admin):** `handleOrderPaid` and `handleOrderCanceled` log a warning and return `200` to pretix. This is intentional — retrying an unknown order forever is wasteful. Consider adding a `console.warn` with enough detail for ops to investigate. A future improvement could enqueue a "platform-create from pretix" reconciliation job.

- **Email on `order.paid` webhook could double-send** if the `registration/service.ts` path already sent a confirmation (e.g. free order that was immediately paid at registration time). Mitigation: the `handleOrderPaid` handler only sends the confirmation email when transitioning from `pending` to `paid` (`updateMany` count > 0 guard), and the registration path sets `status: "paid"` atomically at creation time, so the platform DB already shows `paid` when the webhook arrives — the idempotency gate fires and the email path is never reached. Verify this in a test case.

- **Approval-required + payment-first ordering:** An attendee with `approvalStatus: "pending"` pays in pretix before the admin approves. The handler sets `status: "paid"` but does NOT emit `ticket.issued`. The existing `approve()` function in `approval/service.ts` must subsequently issue the ticket. Review `approve()` to confirm it checks `status` correctly and does not re-call `markOrderPaid` needlessly when status is already `"paid"` — it does (`isFree` path calls `markOrderPaid` with a `PretixValidationError` catch, which would tolerate the already-paid state). The non-free path in `approve()` just sets `approvalStatus = "approved"` and sends the confirmation email, which is correct. No changes needed in `approval/service.ts`.

- **`checkin-created` handler writes a `BadgePrintLog` for remote scans.** Staff will see these in any badge-print log view alongside their own scans. This is correct behavior (the log records actual check-ins, regardless of tool) but warrants a note in AGENTS.md / PR description so future developers understand the `printedByUserId: null` convention means system/pretixSCAN-originated.

### 7. Reconcile storefront publish contract and forward input.live in updateEvent  _(rank 7, Program architecture, effort M)_

- **Files:** `apps/web/prisma/schema.prisma`, `apps/web/prisma/migrations/<next_timestamp>_add_live_on_pretix/migration.sql`, `apps/web/src/lib/events/service.ts`, `apps/web/src/lib/events/public.ts`, `apps/web/src/app/api/webhooks/pretix/route.ts`, `apps/web/src/app/[locale]/(admin)/admin/events/[id]/edit/page.tsx`, `apps/web/src/lib/events/__tests__/public.test.ts`, `apps/web/src/lib/events/__tests__/service.integration.test.ts`
- **Approach:** Step 1 — Add `liveOnPretix` column to the Prisma schema.

In `apps/web/prisma/schema.prisma`, add one field to `EventMapping`:
  `liveOnPretix  Boolean  @default(false)`

Generate and apply the migration:
  `prisma migrate dev --name add_live_on_pretix`

The column defaults to `false`, so all existing rows are treated as not live — the safer side (nothing new leaks to the storefront).

---

Step 2 — Forward `input.live` in `updateEvent` (the one-line P0 fix, service.ts line 179).

In `apps/web/src/lib/events/service.ts`, in the `updateEvent` function, the call to `pretixEvents.updateEvent` currently passes only `{ titleEn, titleAr, date_from }`. Add `live: input.live` to that patch object. This is the confirmed HIGH-severity one-liner: the pretix `live` toggle was silently a no-op on every edit.

---

Step 3 — Keep `liveOnPretix` in sync via the pretix webhook handler.

In `apps/web/src/app/api/webhooks/pretix/route.ts`, after `verifyWebhook` succeeds, handle the action `pretix.event.live_state_changed` (and as a belt-and-suspenders fallback, `pretix.event.updated`).

When either action fires:
  a. Extract `event.organizer` + `event.event` from the webhook payload.
  b. Call `pretixEvents.getEvent(organizerSlug, eventSlug, token)` to read the current `live` boolean.
  c. Call `prisma.eventMapping.updateMany({ where: { pretixOrganizerSlug, pretixEventSlug }, data: { liveOnPretix: ev.live } })`.

Keep the handler lightweight — no throwing, log failures, always return `200 OK` to pretix so it does not retry on our errors.

Note: pretix does not have a dedicated `live_state_changed` action documented; in practice `pretix.event.event.changed` fires on all event saves. Watch for the correct action name in pretix docs / the existing webhook test and adjust. The `PretixWebhookEvent` interface already carries `event` (the slug) — extend it with `organizer` which it already has.

---

Step 4 — Update `listPublicEvents` and `getPublicEvent` to require both predicates.

In `apps/web/src/lib/events/public.ts`:

`listPublicEvents`: change the Prisma `where` from `{ visibility: "public" }` to `{ visibility: "public", liveOnPretix: true }`.

`getPublicEvent`: change the Prisma `findFirst` where from `{ pretixEventSlug: slug, visibility: "public" }` to `{ pretixEventSlug: slug, visibility: "public", liveOnPretix: true }`.

With these two changes the storefront can no longer display a draft event purely because an admin flipped `visibility` to `public` in the local form, and the per-request pretix `getEvent` call that was being used as a live-gate side-effect is no longer needed (the `getEvent` call that remains inside `getPublicEvent` is still correct and wanted — it fetches `dateFrom`/`dateTo` for display).

---

Step 5 — Expose `liveOnPretix` in `getEventForEdit` so the edit page can pre-check the live checkbox correctly.

In `service.ts`, `getEventForEdit` returns `{ mapping, dateFrom, dateTo }`. The edit page (`edit/page.tsx`) passes `initial` to `EventForm` but currently omits the `live` field, so the checkbox always resets to the schema default (`false`). Add `live: mapping.liveOnPretix` to the `initial` spread passed to `EventForm`. This is purely a display improvement but is coherent with the rest of the change.
- **Tests:** Unit tests — `apps/web/src/lib/events/__tests__/public.test.ts`

Existing tests assert `where.visibility === "public"`. Update them to also assert `where.liveOnPretix === true`.

Add two new cases:
  - `listPublicEvents` returns empty when `liveOnPretix` is `false` even if `visibility` is `"public"` (the draft-leak scenario).
  - `getPublicEvent` returns `null` for a public-but-not-live event, and returns the detail for a public-and-live event.

Unit tests — `apps/web/src/lib/events/__tests__/service.integration.test.ts` (or a new `service.test.ts` if a pure-unit mock variant is preferred)

Add a test for `updateEvent` that asserts `pretixEvents.updateEvent` is called with a patch containing `live: true` (and `live: false`) when the corresponding `input.live` is set. This directly covers the P0 regression.

Unit tests — webhook handler

Add or extend `apps/web/src/lib/pretix/__tests__/webhooks.test.ts` (or a new `route.test.ts` near the webhook route) to verify:
  - When the webhook action is `pretix.event.event.changed` (or whatever the live-state action turns out to be), `prisma.eventMapping.updateMany` is called with `{ liveOnPretix: ev.live }`.
  - When pretix returns `live: false`, the column is set to `false`.
  - Unrelated webhook actions (`pretix.event.order.paid`) do not trigger the DB update.

Regression / integration

The existing service integration test (which guards `createEvent`) should be updated to assert `liveOnPretix` defaults to `false` on a newly created mapping.
- **Risk:** Blast radius: Moderate — three layers touched (DB schema, service, public query) plus the webhook handler. Nothing outside the event management and storefront display paths is affected. Registration, check-in, orders, seats, and the public API v1 (`/api/v1/events`) are not touched.

Key risks and mitigations:

1. Existing published events become invisible on the storefront after migration. Because `liveOnPretix` defaults to `false`, any event that was previously visible via `visibility='public'` will disappear until either (a) the pretix webhook fires and sets `liveOnPretix=true`, or (b) an admin opens and saves the event (which now forwards `live` to pretix and the webhook echoes back). Mitigation: run a one-time back-fill query before deploying, or include it in the migration SQL: `UPDATE event_mappings SET live_on_pretix = true WHERE visibility = 'public'` — but only if confirmed that all public events are genuinely live in pretix. Alternatively, deploy Step 2 first (the service.ts fix) and Steps 3–4 in a follow-up once the webhook populates the column for all events.

2. Webhook action name uncertainty. The action string `pretix.event.event.changed` is inferred from the pretix documentation pattern; if it differs the column will never be updated. Mitigation: log all unmatched webhook actions in the handler so the real action name is visible, and add a manual admin endpoint (scoped to super_admin) that calls `getEvent` on pretix and back-fills `liveOnPretix` on demand.

3. Race condition on simultaneous admin save + webhook. Both paths write to `liveOnPretix`. The `updateEvent` path knows the desired `input.live` and can write it to the local column directly at Step 2 without waiting for the webhook echo. This removes the race entirely and makes the column immediately consistent. The webhook then becomes an authoritative reconciliation path, not the only path. Recommendation: in `updateEvent` (service.ts), also write `liveOnPretix: input.live` to the Prisma `update` data block alongside the other local fields.

4. Migration is additive and non-breaking: `Boolean @default(false)` on a new column requires no backfill to run, will not block, and does not alter existing indexes.

### 8. Validate webhook target URLs and block SSRF to internal/metadata endpoints  _(rank 8, Cybersecurity, effort S)_

- **Files:** `apps/web/src/lib/webhooks/ssrf-guard.ts`, `apps/web/src/lib/webhooks/__tests__/ssrf-guard.test.ts`, `apps/web/src/lib/webhooks/admin-service.ts`, `apps/web/src/lib/webhooks/service.ts`, `apps/web/src/lib/webhooks/__tests__/service.test.ts`
- **Approach:** 
**Step 1 — Create `apps/web/src/lib/webhooks/ssrf-guard.ts` (new file)**

This module owns all URL-safety logic and is the only place fetch-blocking rules live.

Export a class `SsrfViolationError extends Error` (so callers can distinguish SSRF rejections from generic errors).

Export `assertSafeWebhookUrl(raw: string): void` which does, in order:

1. Parse the string with the WHATWG `URL` constructor inside a try/catch; throw `SsrfViolationError("Invalid URL")` on parse failure.
2. Reject any scheme that is not exactly `"https:"`. HTTP is insufficient (cleartext leaks the signature); data/file/ftp must never be accepted.
3. Synchronously reject hostnames that are statically dangerous without a DNS lookup:
   - Exact matches: `"localhost"`, `"[::1]"`, `"0.0.0.0"`
   - Suffix match `".local"` and `".internal"`
   - The raw IPv4 literals that cover link-local (`169.254.x.x`) and all RFC 1918 ranges (`10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`) — parse the `hostname` field and check against these ranges using integer arithmetic on the four octets (no external dependency).
   - The link-local IPv6 prefix `"fe80:"`.
   - The AWS instance-metadata literal `"169.254.169.254"` is already covered by the link-local range check but note it explicitly in a code comment.
4. Perform a DNS resolution of the hostname using Node's `dns.promises.lookup` (pass `{ all: true }` to get every A/AAAA record). For each resolved address apply the same RFC 1918/link-local/loopback range checks from step 3. If any resolved address is private, throw `SsrfViolationError("URL resolves to a private address")`. This closes the DNS-rebinding vector where an attacker registers a public hostname that initially resolves to a public IP but later rebinds to an internal one — because the check happens at creation time and the lookup is repeated at delivery time (step 3 below).
5. The function is `async` because of the DNS step; make this explicit in its signature.

Keep the IPv4-range checker as a private helper `isPrivateIPv4(address: string): boolean` in the same file so it can be tested in isolation.

---

**Step 2 — Thread `assertSafeWebhookUrl` into `createWebhook` (admin-service.ts:36)**

In `createWebhook`, before the `prisma.webhook.create` call, `await assertSafeWebhookUrl(input.url)`. No other changes to that function are needed. `SsrfViolationError` will propagate up to the Server Action's catch block, which already serialises `err.message` back to the client — the UI will display the rejection reason automatically.

Do not add a separate `updateWebhook` function (none exists yet); if one is added later, the same guard must be applied there too — add a TODO comment.

---

**Step 3 — Thread `assertSafeWebhookUrl` into `deliver` (service.ts:27)**

In the `deliver` function, at the very top of the `try` block and before `fetch`, `await assertSafeWebhookUrl(d.webhook.url)`. If it throws, fall through to the existing `catch (err)` branch — the error message is already written to `webhookDelivery.error` and `deliver` already returns `false` without re-throwing. This means a webhook whose URL was valid at creation time but later resolves to a private address (DNS rebind) will record a delivery failure rather than silently contacting the internal host.

This also covers `retryDue` and `emit` because both delegate to `deliver`.

The `testWebhook` path in admin-service.ts calls `deliver` directly, so it is protected transitively. No extra guard is needed there.

---

**Step 4 — Surface the error in the UI if desired**

The `createWebhookAction` in `actions.ts` already returns `{ ok: false, error: err.message }` from its catch block. No changes are needed there. The webhook-manager component (`webhook-manager.tsx`) already reads that `error` field. This step is a verification-only step — read `webhook-manager.tsx` to confirm the error is displayed before closing the task.

---

**Step 5 — (Optional hardening) Add a `resolveOnce` wrapper for deliver**

To prevent the DNS check inside `deliver` from adding unacceptable latency to the hot delivery path, the DNS result may be cached for 60 seconds using a simple `Map<hostname, { addrs, expiresAt }>` in memory within `ssrf-guard.ts`. This is a minor optimisation; implement it only if benchmarks show the DNS lookup dominates delivery time. It does not change the external contract of `assertSafeWebhookUrl`.

- **Tests:** 
**`apps/web/src/lib/webhooks/__tests__/ssrf-guard.test.ts` (new file)**

Cover `isPrivateIPv4` (via the exported `assertSafeWebhookUrl` path with a mocked DNS that returns a specific address):
- `10.0.0.1`, `10.255.255.255` → private
- `172.16.0.1`, `172.31.255.255` → private
- `172.15.0.0`, `172.32.0.0` → public (boundary checks)
- `192.168.0.1` → private
- `169.254.169.254` → private (AWS IMDS)
- `8.8.8.8`, `1.1.1.1` → public

Cover `assertSafeWebhookUrl` static (synchronous) checks — mock `dns.promises.lookup` to avoid network calls:
- Plain string `"not a url"` → throws `SsrfViolationError`
- `"http://example.com/hook"` → throws (non-HTTPS scheme)
- `"ftp://example.com"` → throws
- `"https://localhost/hook"` → throws
- `"https://[::1]/hook"` → throws
- `"https://169.254.169.254/latest/meta-data"` → throws at static check (no DNS needed)
- `"https://192.168.1.1/hook"` → throws
- `"https://10.0.0.1/hook"` → throws
- `"https://172.16.0.5/hook"` → throws
- `"https://example.com/hook"` where DNS resolves to `93.184.216.34` → resolves (no throw)
- `"https://evil.example.com/hook"` where DNS resolves to `192.168.1.100` → throws (`SsrfViolationError` on resolved address)

**Updates to `apps/web/src/lib/webhooks/__tests__/service.test.ts`**

- In the `deliver` describe block, add a case: `deliver` called with `url: "https://192.168.1.1/hook"` — mock `assertSafeWebhookUrl` to throw `SsrfViolationError`; assert `deliver` returns `false` and that `prisma.webhookDelivery.update` is called with `data.error` containing the SSRF message. This confirms the guard integrates into the error path correctly without re-throwing.
- Existing passing tests should continue to pass because they already use `"https://hook"` which will pass the static check (hostname `"hook"` is not a reserved literal; the DNS step must be mocked to return a public IP or the guard module mocked entirely).

**For `admin-service.ts` (no dedicated test file exists today)**

Add `apps/web/src/lib/webhooks/__tests__/admin-service.test.ts`:
- `createWebhook` with an HTTP URL → returns a rejection (mocking `assertSafeWebhookUrl` to throw and confirming `prisma.webhook.create` is never called).
- `createWebhook` with a safe HTTPS URL → calls `prisma.webhook.create` as before.
- `testWebhook` with a URL that passes the guard → delegates to `deliver` (spy on `deliver`).

- **Risk:** 
**Blast radius**

Narrow. The change touches three files: one new module, one write-path function (`createWebhook`), and one delivery function (`deliver`). The read-path functions (`listWebhooks`, `listDeliveries`, `setWebhookEnabled`, `rotateWebhookSecret`) are untouched. The Prisma schema, database migrations, Auth.js session logic, pretix adapter, and next-intl routing are all unaffected.

**Failure modes and mitigations**

1. *DNS lookup adds latency to delivery.* The guard runs inside `deliver`'s existing try/catch, which already absorbs network timeouts. Node's default DNS timeout is ~5 s; this is well within the acceptable window for a webhook that otherwise makes an outbound HTTP call. The optional 60-second in-memory cache (Step 5) eliminates the overhead for repeated deliveries to the same host.

2. *Legitimate internal webhook target blocked in a self-hosted deployment.* If an operator runs the app on-premises and routes webhooks to an internal receiver (e.g., `https://ingest.corp.internal/`), the guard will reject the URL. Mitigation: document that the SSRF guard enforces HTTPS and blocks RFC 1918/link-local ranges; operators who need internal targets must configure a public-facing reverse proxy. Do not add an environment-variable bypass — that bypass would itself become a security footgun.

3. *DNS rebinding window between creation check and delivery check.* The check is performed at both creation and delivery, so the rebind window is limited to the TTL of the webhook entry — typically minutes or hours. This is acceptable; the threat model does not include a persistent, repeatedly-retried rebind attack.

4. *IPv6 edge cases.* The static check covers `::1` and the `fe80:` link-local prefix. Other IPv6 private ranges (Unique Local `fc00::/7`) are not covered by the static check but are caught by the DNS-based check if the resolved address falls in those ranges. Add `fc00::/7` range logic to `isPrivateIPv4`'s IPv6 counterpart if operating in dual-stack environments.

5. *`testWebhook` still leaks the HTTP response code.* The current `testWebhook` returns `{ ok: boolean }` (truthy if 2xx). After this change, SSRF URLs are blocked before the fetch, so the oracle is neutralised. No additional change is needed.


### 9. Close multi-tenant isolation seams (listWaitlist check, null-org guard, resolveOrgId dedup)  _(rank 9, Cybersecurity, effort M)_

- **Files:** `apps/web/src/lib/waitlist/service.ts`, `apps/web/src/lib/waitlist/__tests__/service.test.ts`, `apps/web/src/lib/api/handler.ts`, `apps/web/src/lib/api/__tests__/api.integration.test.ts`, `apps/web/src/lib/admin/resolve-org.ts`, `apps/web/src/lib/admin/__tests__/resolve-org.test.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/page.tsx`, `apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/page.tsx`
- **Approach:** The change has three independent sub-tasks that should be committed separately (one commit per seam) so that any regression is bisectable.

--- SEAM 1: listWaitlist empty-list bypass (P1) ---

File: apps/web/src/lib/waitlist/service.ts, lines 50-63.

Current behaviour: entries are fetched unconditionally, then access is checked only when at least one entry exists (the `if (first && ...)` guard). An empty waitlist bypasses the entire authorization check and always returns []. On multi-org that is benign; once two orgs share the same Postgres instance the empty-list path is the normal case at the start of every event, but more critically the conditional means a caller can never rely on 'rejected == forbidden'.

Fix: resolve the event's organization before fetching entries. Fetch the EventMapping for `eventMappingId`; if not found throw ForbiddenError (fail closed). Call `canAccessEvent` against that mapping's organizationId unconditionally; throw ForbiddenError if it fails. Only then execute `findMany` on WaitlistEntry. Remove the `entries[0]` probe entirely.

Concrete steps:
1. Add a prisma.eventMapping.findUnique call at the top of listWaitlist for `{ where: { id: eventMappingId }, select: { organizationId: true, localEventId: true } }`.
2. If null → throw new ForbiddenError("Event not found").
3. Call canAccessEvent(session, mapping.organizationId, mapping.localEventId); if false → throw new ForbiddenError("Access denied").
4. Execute the existing findMany without the include: { eventMapping: true } (no longer needed post-check; drop the include to avoid the extra join).
5. Remove the dead `first` / conditional-access block (lines 56-62).

--- SEAM 2: null-org guard fails open in resolveApiEvent (P2) ---

File: apps/web/src/lib/api/handler.ts, line 44.

Current behaviour: `organizationId: ctx.organizationId ?? undefined`. When a key's organizationId is NULL in the database (schema allows it, see `ApiContext.organizationId: string | null` in auth.ts line 19), the Prisma `where` clause receives `{ id: eventId, organizationId: undefined }`. Prisma silently drops undefined fields from WHERE, so the query matches the event in ANY organization — a cross-org read.

Fix: fail closed. In `resolveApiEvent`, before the Prisma call, add an explicit check:
  if (!ctx.organizationId) throw new ApiError("forbidden", "API key has no organization", 403);

Then change the Prisma call to `where: { id: eventId, organizationId: ctx.organizationId }` (no `?? undefined`). The type narrows to `string` after the guard so TS is satisfied without casting.

Note: the schema may permit null keys for future use-cases (e.g. super-admin integrations). The guard should stay in resolveApiEvent specifically (the event-scoped operation), not in authenticateRequest globally, so that any future /me or global-scope endpoints are not broken.

--- SEAM 3: inline resolveOrgId in api-keys and webhooks pages diverges from shared lib (dev P2 + admin-ui finding) ---

Files in scope:
- apps/web/src/lib/admin/resolve-org.ts (shared lib, correct: includes finance role)
- apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/page.tsx (inline copy, line 9-17: omits finance role)
- apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/page.tsx (inline copy, line 9-17: omits finance role)

The inline copies filter memberships by `role === "organizer_admin"` only. The shared lib also accepts `role === "finance"`. Both pages gate on `requireRole(["super_admin", "organizer_admin"])` so the `finance` divergence does not open an access hole on those two pages (finance is not in requireRole), but it means the shared lib is unreliable as a contract: callers already using it (integrations pages, smtp page) will behave differently from callers using the inline version for the exact same session. When `finance` access is extended to api-keys/webhooks pages — a natural next step — the inline copy will silently shadow the shared lib again.

Fix:
1. Delete the `async function resolveOrgId` block (lines 9-17) in api-keys/page.tsx.
2. Add `import { resolveOrgId } from "@/lib/admin/resolve-org";` at the top of that file alongside the existing imports.
3. Repeat for webhooks/page.tsx.
4. No behavior change for current users of those two pages because finance is not in their requireRole list — the extra `finance` membership path in the shared lib simply becomes reachable when requireRole is later widened. Document this in a comment on the shared lib: "Finance members can reach this path; callers are responsible for their own requireRole gate."

--- ORDER OF COMMITS ---
1. Seam 3 (resolveOrgId dedup) — pure refactor, zero behavior change, lowest risk, land first.
2. Seam 2 (null-org handler guard) — closes API escape hatch; one-liner change with a new unit test.
3. Seam 1 (listWaitlist) — restructures the service function; lands last so the test suite covers it before merge.
- **Tests:** SEAM 1 — apps/web/src/lib/waitlist/__tests__/service.test.ts

Current mock in this file uses `prisma.waitlistEntry.findFirst` and `prisma.waitlistEntry.create` but not `findMany` or `eventMapping.findUnique`. Extend the mock:

a) Add `prisma.waitlistEntry.findMany` to the vi.mock factory.
b) Add `prisma.eventMapping` with `findUnique` to the vi.mock factory.

New test cases to add in a `describe("listWaitlist")` block:
- "throws ForbiddenError when event mapping not found": mock eventMapping.findUnique returns null; expect listWaitlist(orgAdmin, "missing") to reject with ForbiddenError.
- "throws ForbiddenError when session cannot access the event's org": mock eventMapping.findUnique returns { organizationId: "orgB", localEventId: "loc1" }; session is orgAdmin (orgA); expect ForbiddenError.
- "returns entries when session has access": mock eventMapping.findUnique returns { organizationId: "orgA", localEventId: "loc1" }; mock findMany returns [entry]; expect result to equal [entry].
- "returns empty array when no entries exist (authorized path)": same mapping mock; findMany returns []; expect []. This is the key regression test — previously [] bypassed the auth check, now [] is only returned after auth passes.
- "super admin can list any org's entries": session = superAdmin; mapping.organizationId = "orgB"; expect resolve without throw.

SEAM 2 — apps/web/src/lib/api/__tests__/api.integration.test.ts (integration, gate on TEST_DATABASE_URL) and a new unit test in the handler tests.

Since handler.ts has no dedicated unit test file, add cases to the integration test:
- "key with null organizationId cannot access any event via resolveApiEvent — returns 404": seed an ApiKey with organizationId=null (if schema allows) via raw prisma and attempt GET /api/v1/events/:id; expect 403 with code "forbidden".
  Alternatively, if schema enforces non-null, document that the existing NOT NULL constraint is the mitigation and add a comment to resolveApiEvent explaining the guard is a defense-in-depth backstop.

Check schema first: if `organizationId` on ApiKey is nullable in Prisma schema, add the integration test. If it is NOT NULL, the guard is still worth adding for defense-in-depth but the test must be a unit test mocking authenticateRequest to return { organizationId: null }. Add that unit test in apps/web/src/lib/api/__tests__/handler.test.ts (new file):
- mock authenticateRequest to return a ctx with organizationId: null
- call resolveApiEvent with a valid event id
- expect the returned response to be a 403 "forbidden" JSON envelope

SEAM 3 — apps/web/src/lib/admin/__tests__/resolve-org.test.ts (new file)

This file does not currently exist. Create a unit test for the shared lib:
- "returns organizer_admin membership's org": session with one organizer_admin membership returns that org.
- "returns finance membership's org when no organizer_admin": session with only a finance membership returns that org's id.
- "prefers organizer_admin over finance": session with both roles in different orgs — verify the find() ordering (organizer_admin comes first in the memberships array; document the existing find() returns the first match so test is deterministic if array order is stable).
- "super admin falls back to first org from DB": mock prisma.organization.findFirst; isSuperAdmin = true; memberships = []; expect the mocked org id.
- "returns null when super admin and no org exists": mock returns null; expect null.
- "returns null for non-admin with no memberships": isSuperAdmin = false; memberships = []; expect null.
- **Risk:** SEAM 1 — listWaitlist restructure.
Blast radius: the single call site is the admin waitlist page (apps/web/src/app/[locale]/(admin)/admin/events/[id]/waitlist/page.tsx line 22). No other caller of listWaitlist exists in the codebase. The API GET /api/v1/events/[id]/waitlist does NOT use listWaitlist — it queries Prisma directly inside withApi/resolveApiEvent, so it is unaffected.
Risk: if any caller passes an eventMappingId that does not exist in EventMapping (e.g. a stale ID from a deleted event), the new code throws ForbiddenError instead of returning []. The admin page already calls getEventForSession just before listWaitlist and calls notFound() if the event is missing, so in practice the mapping will always exist. Still, the error surface changes from a silent [] to a thrown exception. Mitigation: the admin page's try/catch (implicit via Next.js error boundary) will render the error page, which is correct.
Second risk: dropping `include: { eventMapping: true }` from findMany removes a join. Verify that no consumer of the returned entries array reads `.eventMapping` after this change. The page only accesses entry.id, entry.email, entry.position, entry.status — safe.

SEAM 2 — null-org guard in resolveApiEvent.
Blast radius: every route that calls resolveApiEvent: GET/POST /api/v1/events/[id]/waitlist, and any future event-scoped routes. All existing keys stored in the DB have a non-null organizationId by design (admin-service.ts always sets it). So in production the guard will never fire today. Risk is purely additive: a key that would have (incorrectly) leaked cross-org data now gets a 403. No legitimate caller is broken.
Mitigation: verify Prisma schema for ApiKey.organizationId nullability before merging. If the column has a NOT NULL constraint at the database level, the guard is defense-in-depth only; add a comment to that effect.

SEAM 3 — resolveOrgId dedup.
Blast radius: api-keys/page.tsx and webhooks/page.tsx. The only behavioral difference between the inline copy and the shared lib is that the shared lib also returns an org for `finance` role. Both pages gate with `requireRole(["super_admin", "organizer_admin"])`, so a finance-only user can never reach the page at all — the import swap has zero observable behavior change for current users.
Risk: near zero. The only way this regresses is if someone calls the shared lib and relies on it NOT resolving finance members, which is an unlikely semantic inversion. The shared lib's behavior (includes finance) is the correct long-term contract; the inline copies were the aberration.

### 10. Sanitize internal error messages on public and API surfaces  _(rank 10, Development, effort S)_

- **Files:** `apps/web/src/lib/errors/app-error.ts`, `apps/web/src/lib/errors/sanitize.ts`, `apps/web/src/app/[locale]/(public)/events/[slug]/register/actions.ts`, `apps/web/src/app/api/v1/events/[id]/attendees/route.ts`, `apps/web/src/app/[locale]/(public)/events/[slug]/waitlist-actions.ts`, `apps/web/src/app/[locale]/(staff)/staff/checkin/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/events/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/approvals/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/finance/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/events/[id]/waitlist/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/delete-queue/actions.ts`, `apps/web/src/lib/pretix/errors.ts`, `apps/web/src/lib/errors/__tests__/sanitize.test.ts`
- **Approach:** **Step 1 — Create `apps/web/src/lib/errors/app-error.ts` (new file)**

Define a typed `AppError` class that callers throw intentionally with a safe, user-facing message. It carries a `code` string (machine-readable, safe to expose) and an optional `statusHint` (HTTP status for API routes). This class is the approved channel for propagating safe messages through the catch boundary.

```
AppError(code: string, publicMessage: string, statusHint?: number)
```

Also export a `UserFacingError` type union (initially just `AppError | ForbiddenError`) so future additions are opt-in.

**Step 2 — Create `apps/web/src/lib/errors/sanitize.ts` (new file)**

Implement `toSafeError(err: unknown): { code: string; message: string; status: number }`. The mapping logic:

1. If `err instanceof AppError` → pass through code, publicMessage, statusHint.
2. If `err instanceof ForbiddenError` → code `"forbidden"`, message `"Access denied"`, status 403.
3. If `err instanceof PretixValidationError` → code `"validation_failed"`, message `"The request could not be processed"`, status 422. (The caller may separately expose `fieldErrors` for admin surfaces.)
4. If `err instanceof PretixError` → code `"integration_error"`, message `"A ticketing system error occurred"`, status 502.
5. If `err instanceof NotImplemented` → code `"not_implemented"`, message `"This operation is not available yet"`, status 501.
6. Anything else → code `"internal_error"`, message `"An unexpected error occurred"`, status 500.

In all branches, call `console.error("[error]", err)` before returning, so the raw error is always logged server-side. The raw `(err as Error).message` must never be forwarded.

**Step 3 — Update `apps/web/src/lib/pretix/errors.ts`**

No structural changes. Add a JSDoc note that all three classes (`PretixError`, `PretixValidationError`, `NotImplemented`) are handled by `toSafeError` and must not be caught-and-re-thrown as plain `Error`.

**Step 4 — Fix the two confirmed unsafe surfaces (priority)**

`apps/web/src/app/[locale]/(public)/events/[slug]/register/actions.ts` line 52:
- Replace `return { error: (err as Error).message }` with `return { error: toSafeError(err).message }`.
- This is the public-facing UI surface; the fix is a one-line change but must be correct.

`apps/web/src/app/api/v1/events/[id]/attendees/route.ts` line 58:
- Replace `return fail("registration_failed", (err as Error).message, 422)` with `const safe = toSafeError(err); return fail(safe.code, safe.message, safe.status)`.
- The code changes from the hardcoded `"registration_failed"` to the semantically correct code from the map (e.g. `"integration_error"` for pretix, `"internal_error"` for unknown).

**Step 5 — Sweep all remaining `(err as Error).message` catch blocks**

Apply `toSafeError` uniformly across every catch block that returns a user/API-visible string. Affected files (from the grep):

- `apps/web/src/app/[locale]/(public)/events/[slug]/waitlist-actions.ts` line 24
- `apps/web/src/app/[locale]/(staff)/staff/checkin/actions.ts` line 32
- `apps/web/src/app/[locale]/(admin)/admin/events/actions.ts` lines 47, 73, 99 (these already guard `PretixValidationError` first, so the fallthrough catch is the only changed path)
- `apps/web/src/app/[locale]/(admin)/admin/approvals/actions.ts` lines 21, 36
- `apps/web/src/app/[locale]/(admin)/admin/finance/actions.ts` line 21
- `apps/web/src/app/[locale]/(admin)/admin/events/[id]/waitlist/actions.ts` line 22
- `apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/actions.ts` lines 27, 39
- `apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/actions.ts` lines 27, 39, 51, 62
- `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts` lines 22, 35, 52, 64
- `apps/web/src/app/[locale]/(admin)/admin/delete-queue/actions.ts` line 17

For the **admin-only** surfaces (approvals, finance, settings, delete-queue), the safe message is still appropriate because leaking pretix internals to admin browsers is still an information disclosure risk and needlessly broad. Admin surfaces can show `code` values (safe, controlled strings) in the UI if needed for debugging.

Note: `apps/web/src/lib/webhooks/service.ts` line 57 logs `(err as Error).message` to an internal webhook log row (not sent to any browser). Keep it as-is or narrow it, but it is not a public surface — flag but do not block on it.

**Step 6 — Narrow the `(err as Error)` unsafe cast**

Replace every `(err as Error)` with an `err instanceof Error ? err : new Error(String(err))` guard inside `toSafeError`, so the cast is centralized and type-safe. Callers no longer need the cast at all.

**Step 7 — Wire `AppError` into service layer for domain-specific messages**

Identify service-layer `throw new Error(...)` calls whose message is intentionally user-safe (e.g., `"Seat selection is required for this event"` in `registration/service.ts:68`, `"One or more selected seats are unavailable"` in `seats/service.ts:67`, `"Seat hold expired or seats are not held by this order"` in `seats/service.ts:84`). Convert these to `throw new AppError("seat_unavailable", "...", 409)` etc. so they propagate cleanly through `toSafeError` with the right HTTP status and code, instead of falling through to `"internal_error"`.

Do NOT change service-layer throws for infrastructure faults (`"Organization not found"`, `"Event not found"`) that are internal guard assertions — those should remain as plain `Error` and map to `internal_error` in `toSafeError`.
- **Tests:** **Unit tests — `apps/web/src/lib/errors/__tests__/sanitize.test.ts` (new file)**

Add a Vitest `describe("toSafeError")` block with one `it` per mapped error type:
- `PretixError` → code `"integration_error"`, status 502, message does not contain pretix URL or endpoint name.
- `PretixValidationError` → code `"validation_failed"`, status 422.
- `NotImplemented` → code `"not_implemented"`, status 501.
- `ForbiddenError` → code `"forbidden"`, status 403.
- `AppError` (code `"seat_unavailable"`, status 409) → passes through verbatim.
- Plain `Error` with internal message → code `"internal_error"`, message is the generic string, NOT the original `.message`.
- Non-Error thrown value (e.g., a string) → code `"internal_error"`, does not throw.
- Verify `console.error` is called in all branches (spy on it).

**Extend existing tests**

`apps/web/src/lib/registration/__tests__/service.test.ts`:
- Add a case: `createOrder` rejects with a `PretixError`; verify `register()` propagates it (it currently re-throws via `seatErr` path and the plain throw path).

`apps/web/src/lib/pretix/__tests__/errors.test.ts`:
- Already tests class identity. Add: `toSafeError(new PretixError(...))` returns expected shape (import from sanitize module).

`apps/web/src/lib/api/__tests__/api.integration.test.ts`:
- Add a case for `POST /api/v1/events/:id/attendees` where the mocked `register` throws a `PretixError`. Assert: response status is 502, body `error.code` is `"integration_error"`, body `error.message` does NOT contain "pretix" or the endpoint URL.

`apps/web/src/app/[locale]/(public)/events/[slug]/register/actions.ts` (no dedicated test file exists — create `apps/web/src/app/[locale]/(public)/events/[slug]/__tests__/register-actions.test.ts`):
- Mock `register` to throw a `PretixError`; assert `registerAction` returns `{ error: "A ticketing system error occurred" }`.
- Mock `register` to throw an `AppError("seat_unavailable", "Seats are no longer available", 409)`; assert the public message passes through.
- Mock `register` to throw a plain `Error("pretix API error 500 for https://pretix.example.com/api/v1/...")`; assert returned `error` does NOT contain the URL.
- **Risk:** **Blast radius**

Moderate-low. The change affects every catch boundary on the public and API surface, which is exactly what is intended. The specific risks are:

1. **Regression: a caller relied on the raw message text.** Any UI component that pattern-matches on `error` string content will silently break (e.g., a form that checks `if (error.includes("seat"))` to show a specific message). Mitigation: the `code` field in `AppError` and `toSafeError` output gives callers a stable, machine-readable key. Audit UI components for string-match on `error` before merging.

2. **Loss of debuggability.** Operators lose the raw pretix body from browser devtools. Mitigation: `toSafeError` always calls `console.error` before returning, so the full error appears in server logs. Ensure log aggregation (e.g., Vercel log drain) is in place.

3. **Admin surfaces become less informative.** Admin users currently see raw pretix validation errors in some flows (e.g., event create/update in `events/actions.ts` passes `PretixValidationError.fieldErrors` through, which is safe — field keys, not endpoint URLs). This is preserved because `PretixValidationError.fieldErrors` is a structured object of form-field strings, not raw HTTP internals. Only the catch-all fallthrough changes.

4. **Status code changes on the attendees POST endpoint.** The hardcoded 422 is replaced by the semantically correct status from `toSafeError` (e.g., 502 for pretix errors). Integrators depending on `422` for all failures may need to be informed. Mitigation: document in the API changelog; the `code` field in the response body is a more reliable discriminant than HTTP status.

**Mitigations**

- Implement in a feature branch; run the full test suite (including integration tests with `TEST_DATABASE_URL`) before merging.
- Review all `error?.includes(...)` or `error ===` checks in `.tsx` UI files after Step 5 is complete.
- Keep `toSafeError` in a single module so the mapping is easy to audit and extend.

### 11. Make promote() and other repeatable mutations idempotent  _(rank 11, Development, effort S)_

- **Files:** `apps/web/src/lib/waitlist/service.ts`, `apps/web/src/lib/waitlist/__tests__/service.test.ts`, `apps/web/src/lib/finance/service.ts`, `apps/web/src/lib/finance/__tests__/service.integration.test.ts`
- **Approach:** The approved pattern already lives in `approval/service.ts`. Every step below clones that pattern into the two remaining flows.

**Step 1 — Fix `promote()` in `waitlist/service.ts`**

Lines 85-88 currently:
```
const updated = await prisma.waitlistEntry.update({
  where: { id: entry.id },
  data: { status: "promoted", promotedAt: new Date() },
});
```

Replace with three changes:

a. Add an early-return idempotency guard immediately after the access check (around line 83), before any DB write:
   `if (entry.status === "promoted" || entry.status === "converted") return entry;`
   This mirrors the `if (order.approvalStatus === "approved") return order;` pattern in `approve()`.

b. Replace the unconditional `.update()` with an atomic claim:
```
const claim = await prisma.waitlistEntry.updateMany({
  where: { id: entry.id, status: "waiting" },
  data: { status: "promoted", promotedAt: new Date() },
});
if (claim.count === 0) {
  // Lost a race — another request already promoted this entry.
  const current = await prisma.waitlistEntry.findFirst({
    where: { id: entry.id }, include: { eventMapping: true },
  });
  return current ?? entry;
}
```

c. Move the `sendEmail`, `auditLog.create`, and `emit` calls to execute only inside the `claim.count === 1` branch (i.e., after the guard above, which exits on count === 0).

No schema migration is required. The `WaitlistStatus` enum already contains `waiting` and `promoted`.

**Step 2 — Fix `markOrderPaid()` in `finance/service.ts`**

The existing read-then-update introduces a TOCTOU window. The early-return guard (`isTicketIssued`) is correct logic but not atomic.

a. After the pretix sync succeeds (or is tolerated as `PretixValidationError`), replace the unconditional `.update()` on line 107 with an atomic claim:
```
const claim = await prisma.attendeeOrder.updateMany({
  where: { id: order.id, status: { not: "paid" } },
  data: { status: "paid" },
});
if (claim.count === 0) {
  // Another concurrent request already flipped status to paid — idempotent.
  return (await prisma.attendeeOrder.findUnique({
    where: { id: order.id }, include: { eventMapping: true },
  })) ?? order;
}
```

b. Gate the confirmation email and `auditLog.create` on `claim.count === 1` (i.e., let them remain in the normal flow after the guard). The early return on `count === 0` skips both, which is the desired behaviour — the winner of the race already fired them.

Note: The pretix sync call can still be made by both concurrent callers. `markOrderPaid` on an already-paid pretix order returns `PretixValidationError`, which is already caught and tolerated on lines 88-91. No change needed there.

**Step 3 — Update unit-test mocks for `promote()` in `waitlist/__tests__/service.test.ts`**

The existing tests mock `prisma.waitlistEntry.update` (singular). After Step 1 the production code uses `updateMany` instead:

a. Add `updateMany: vi.fn()` to the `waitlistEntry` mock object (alongside the existing `findFirst`, `create`, `update`).
b. Update the `beforeEach` block in the `promote` describe block to set: `mock(prisma.waitlistEntry.updateMany).mockResolvedValue({ count: 1 });`
c. Update the assertion in the "promotes: status + email + audit" test to inspect `prisma.waitlistEntry.updateMany.mock.calls[0][0].data.status` (not `.update`).
d. Remove the `.update` mock setup; keeping it around causes no harm but is dead code.

**Step 4 — Add idempotency / race-condition tests**

In `waitlist/__tests__/service.test.ts`, inside the existing `describe("promote")` block, add:

- "already-promoted entry returns early without DB write": mock `findFirst` to return `{...entry, status:"promoted"}`, call `promote()`, assert `updateMany` was NOT called and email was NOT sent.
- "concurrent race (count=0) returns current state without side effects": mock `findFirst` with `status:"waiting"`, mock `updateMany` to return `{count:0}`, mock a second `findFirst` call to return `{...entry, status:"promoted"}`, call `promote()`, assert email NOT called and audit NOT called.

In `finance/__tests__/service.integration.test.ts` (the `describe.skipIf(!run)` block), add:

- "concurrent mark-paid: second caller is idempotent, only one audit row written": create one order, call `markOrderPaid` twice in parallel (`Promise.all`), then count `auditLog` rows for `order.marked_paid` — expect exactly 1.

Optionally add a unit test parallel to the integration test using mock `updateMany({count:0})` to validate the no-email / no-audit branch without a real DB.
- **Tests:** Unit (vitest, no DB needed):
- `waitlist/__tests__/service.test.ts`: (a) already-promoted entry → no updateMany, no email; (b) race lost (count=0) → no email, no audit, returns current state from re-fetch; (c) update existing "promotes" assertion to target `updateMany` not `update`.
- Optional finance unit: mock `markOrderPaid` with `updateMany({count:0})` → no email, no audit row.

Integration (requires TEST_DATABASE_URL, `describe.skipIf(!run)`):
- `finance/__tests__/service.integration.test.ts`: `Promise.all` two concurrent `markOrderPaid` calls on same order → `auditLog` count for `order.marked_paid` is exactly 1; order `status` is `paid`.
- `approval/__tests__/service.integration.test.ts`: already has concurrent coverage implicitly; no change needed — those tests verify `updateMany` call shapes.
- **Risk:** Blast radius is narrow — two service files and their two test files. No schema changes, no new endpoints, no UI changes.

Mitigation notes:
- `approval/service.ts` is already correct and is not being touched. It serves as the reference implementation.
- The `promote()` early-return guard for `status === 'converted'` is purely defensive; converted entries could not previously reach `promote()` via normal flow, but guarding prevents data corruption if they ever do via a direct API call.
- `markOrderPaid()` already tolerates a `PretixValidationError` from pretix (duplicate payment). The new `updateMany` guard adds the same tolerance on the local DB side without altering the pretix call sequence.
- The race-lost path in `markOrderPaid()` performs a fresh `findUnique`. This adds one DB round-trip only in the (rare) losing branch of a concurrent call; normal single-caller path is unchanged in query count.
- Tests that currently mock `waitlistEntry.update` (singular) will start failing on line mismatch. Step 3 covers the required mock update — this is a deliberate, load-bearing mock migration, not an oversight.

### 12. Make testSmtpAction exercise the real SMTP transport  _(rank 12, Development, effort S)_

- **Files:** `apps/web/src/lib/integrations/smtp-service.ts`, `apps/web/src/lib/email/service.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts`, `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/smtp/smtp-form.tsx`, `apps/web/src/lib/integrations/__tests__/integrations.test.ts`
- **Approach:** ## Step-by-step

### 1. Add `sendSmtpTestEmail` to `apps/web/src/lib/email/service.ts`

Add a new exported function `sendSmtpTestEmail(config: SmtpConfig): Promise<{ ok: boolean; error?: string }>` that:
- Accepts a plain-object config struct (host, port, username, password, fromEmail, fromName, encryption) — all decrypted by the caller.
- Builds a **one-shot** nodemailer transporter from those values (do NOT touch or invalidate the module-level `cached` transport, which is driven by env vars and used for all real sends). Use `nodemailer.createTransport({ host, port, secure, auth? })` inline.
- Calls `transporter.verify()` first (preferred over sending to a dummy address — it does EHLO/AUTH without delivering a message). Capture success/failure.
- Returns `{ ok: true }` on success, `{ ok: false, error: message }` on failure.
- Does NOT swallow; does NOT change any module-level state; is environment-agnostic (no NODE_ENV branch).

Define a `SmtpTestConfig` interface in the same file (host, port, username, password, fromEmail, fromName, encryption).

### 2. Add `sendSmtpTest` to `apps/web/src/lib/integrations/smtp-service.ts`

Add a new exported function `sendSmtpTest(session, organizationId)` that:
- Calls `assertCanEditIntegration(session, organizationId)` (same guard as `saveSmtp`).
- Fetches the raw DB row via `prisma.smtpSetting.findUnique({ where: { organizationId } })`.
- If no row exists, returns `{ ok: false, error: 'smtp_not_configured' }` immediately (without calling `recordSmtpTest` — there is nothing to test).
- Decrypts `passwordEnc` using `decryptField` from `./secrets`.
- Calls `sendSmtpTestEmail({ host, port, username, password, fromEmail, fromName, encryption })` from the email service.
- Calls `recordSmtpTest(session, organizationId, ok, error)` with the real outcome.
- Returns `{ ok, error }`.

This keeps DB/auth concern in the service layer and transport concern in the email module — consistent with the existing separation.

### 3. Rewrite `testSmtpAction` in `apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts`

Remove lines 29–33 entirely (the `NODE_ENV !== "production"` block). Replace the body with:

```
const { ok, error } = await sendSmtpTest(session, orgId);
return result(ok, ok ? undefined : (error ?? "SMTP test failed"));
```

Import `sendSmtpTest` from `@/lib/integrations/smtp-service` at the top. Remove the now-unused `recordSmtpTest` import (it is called internally by `sendSmtpTest` now).

### 4. Update the UI message in `smtp-form.tsx`

Line 70 currently says "Test email sent (dev-log in non-production)." which is now wrong for all environments. Change the success message to a neutral "SMTP connection verified." The failure branch is already accurate.

### 5. Grep-sweep for other environment-as-proxy antipatterns (read-only audit step)

The grep output confirms the remaining `NODE_ENV` usages are legitimate:
- `lib/auth/config.ts:15` — `useSecureCookies` in production: correct.
- `lib/db/client.ts:10,13` — verbose Prisma logging in dev + singleton guard: correct.
- `lib/tokens/magic-link.ts:6` — production-only strict token enforcement: correct.
- `lib/config/env.ts:116,129` — `assertProductionEnv` and email-disabled opt-out: correct.
- `lib/email/service.ts:25` — `emailMode()` returning "disabled" in production with no SMTP: correct and intentional (this is not used by the new test path, which bypasses env vars entirely).
- `app/api/health/ready/route.ts:13` — readiness check: correct.

No further antipatterns to fix in scope. Document this in a brief inline comment on the new `sendSmtpTestEmail` to make the design intent explicit.

- **Tests:** ### Unit tests — update `apps/web/src/lib/integrations/__tests__/integrations.test.ts`

Add a `describe("sendSmtpTest")` block:

1. **No row → returns not-ok without touching DB update**: mock `prisma.smtpSetting.findUnique` to return `null`; assert `ok === false` and `error === 'smtp_not_configured'`; assert `prisma.smtpSetting.update` was not called.
2. **SMTP transport succeeds → records ok=true**: mock `findUnique` to return a full row with `passwordEnc = encryptField("pw")`; mock `sendSmtpTestEmail` (vi.mock on `@/lib/email/service`) to resolve `{ ok: true }`; mock `prisma.smtpSetting.update` and `prisma.auditLog.create`; assert `ok === true`; assert `prisma.smtpSetting.update` was called with `lastError: null`.
3. **SMTP transport fails → records ok=false with error string**: same setup but `sendSmtpTestEmail` returns `{ ok: false, error: 'ECONNREFUSED ...' }`; assert `ok === false`; assert `prisma.smtpSetting.update` was called with `lastError` equal to the error string.
4. **Finance role is denied**: assert `sendSmtpTest(financeSession, orgId)` throws `ForbiddenError`.

### Unit tests — update `apps/web/src/lib/email/__tests__/service.test.ts`

Add a `describe("sendSmtpTestEmail")` block:

1. **verify() success → returns ok:true**: mock `nodemailer.createTransport` to return an object with `verify: vi.fn().mockResolvedValue(true)`; assert return is `{ ok: true }`.
2. **verify() throws → returns ok:false with message**: mock `verify` to throw `new Error('ECONNREFUSED')`; assert `{ ok: false, error: 'ECONNREFUSED' }`.

These are pure unit tests; no network calls.

### Integration test (`m11.integration.test.ts`) — no change needed

The existing test covers `saveSmtp` and read-back; `sendSmtpTest` requires a live SMTP server which is already guarded by `TEST_DATABASE_URL`. No new integration test is warranted here.

### No action-layer test currently exists

There is only one test file for `actions.ts` (`health.test.ts` is unrelated). The action is a thin shim — `sendSmtpTest` test coverage is sufficient. If an action-layer test is later added, mock both `getSessionContext` and `sendSmtpTest` from the service.

- **Risk:** **Blast radius: very small.**

- The only production behaviour change is inside `testSmtpAction`. No other code paths call this function; it is behind the admin SMTP settings page, only reachable by `organizer_admin` or superadmin.
- `sendSmtpTestEmail` creates its own one-shot transporter and calls `verify()` — it does not touch the module-level `cached` transporter, so existing email delivery for registrations/confirmations is entirely unaffected.
- `recordSmtpTest` is still called via the new service helper, so audit logging and `lastTestedAt`/`lastError` DB fields continue to be written correctly.
- The UI success message change is cosmetic only.

**Mitigations:**

- If `prisma.smtpSetting.findUnique` throws (e.g. DB connectivity), the error propagates to the `catch` in `testSmtpAction`, which returns `{ ok: false, error: message }` — the existing error boundary in the action is sufficient.
- If the operator has not yet saved SMTP settings, the "no row" early return prevents a decrypt-of-null crash.
- `decryptField` will throw if `passwordEnc` is corrupt; this is surfaced as a test failure message rather than a 500, because the action's `try/catch` wraps the service call.
- No migration is required. No schema change. No new env variables.

**One subtle risk to document:** `nodemailer.verify()` tests the EHLO/AUTH handshake but does NOT test DKIM/SPF deliverability or whether the `fromEmail` domain is accepted by the remote MTA. The success message in the UI should say "connection verified" (already captured in step 4 above), not "email delivered", to set correct operator expectations.


### 13. Add a per-IP dimension to the login rate limiter  _(rank 13, Cybersecurity, effort S)_

- **Files:** `apps/web/src/lib/security/rate-limit.ts`, `apps/web/src/lib/auth/config.ts`, `apps/web/src/lib/security/__tests__/rate-limit.test.ts`, `apps/web/src/lib/auth/__tests__/config.test.ts`
- **Approach:** **Background and constraints**

The `authorize` callback in `apps/web/src/lib/auth/config.ts` already receives a `request: Request` as its second argument (confirmed by `@auth/core/providers/credentials.d.ts` line 65). The nginx reverse proxy at `docker/nginx.conf` injects both `X-Real-IP` and `X-Forwarded-For` for every request to the Next.js app. The in-memory store in `rate-limit.ts` is a plain `Map` — adding a second key lookup is zero-overhead and requires no new infrastructure.

**Step 1 — Add an IP-extraction helper to `rate-limit.ts`**

Add a pure, exported function `extractIp(request: Request): string` inside `apps/web/src/lib/security/rate-limit.ts`. The function reads headers in this priority order:

1. `X-Real-IP` (the single canonical IP nginx sets).
2. The first token of `X-Forwarded-For` (comma-split, trimmed).
3. Falls back to the string literal `"unknown"` when neither header is present (covers unit tests and direct-connection scenarios).

Do not use any regex or third-party library — `request.headers.get()` plus `.split(",")[0].trim()` is sufficient. This function stays in `rate-limit.ts` so its tests are co-located with the limiter's tests.

**Step 2 — Add a second `rateLimit` call inside `authorize` in `apps/web/src/lib/auth/config.ts`**

Modify the `authorize(raw, request)` signature to accept the second `request: Request` parameter (the parameter is already passed by Auth.js; only the function signature needs to be updated).

After the email-keyed check (the existing `login:${email}` call on line 36) but before the Prisma lookup, add a second rate-limit call keyed on the IP address:

```
const ip = extractIp(request);
if (!rateLimit(`login:ip:${ip}`, 20, 300_000).allowed) {
  return null;
}
```

Choose limits of **20 attempts per 5 minutes per IP** (versus 5 per account). This is intentionally more permissive than the per-email window because a single corporate NAT gateway or VPN exit node may legitimately host multiple real users. The `login:ip:` prefix namespace is explicit so IP keys never collide with email keys if a future caller forgets to namespace.

Keep both checks in sequence, email first then IP, to preserve the existing account-level defense before the IP-level defense.

**Step 3 — Import `extractIp` in config.ts**

Add `extractIp` to the existing import of `rateLimit` from `"@/lib/security/rate-limit"`. No new import lines needed beyond updating the named import list.

**Step 4 — Acknowledge the multi-instance deferred item in a code comment**

Directly above the IP rate-limit call, add a one-line comment: `// NOTE: both limiters are in-memory; swap rateLimit for a Redis-backed limiter before horizontal scaling.` This makes the deferred work visible at the exact callsite without creating a separate tracking ticket.

**Step 5 — Verify the nginx `X-Real-IP` header reaches the app**

No code change needed here, but confirm during implementation review that `AUTH_TRUST_HOST` or `trustHost: true` is set in the Auth.js config (or that Next.js's built-in header forwarding is active). Currently `compose.yaml` sets `NEXTAUTH_URL` which implies trusted host mode. If `request.headers.get("x-real-ip")` returns null in a smoke test, `trustHost: true` must be added to the `NextAuth({...})` options object.
- **Tests:** **In `apps/web/src/lib/security/__tests__/rate-limit.test.ts`**

Add a new `describe("extractIp")` block:

- Verify that `X-Real-IP` header value is returned when present.
- Verify that the first token of a comma-separated `X-Forwarded-For` is returned when `X-Real-IP` is absent.
- Verify that `X-Real-IP` takes precedence over `X-Forwarded-For` when both are present.
- Verify that `"unknown"` is returned when neither header is present.
- Verify that surrounding whitespace in `X-Forwarded-For` is trimmed (e.g. `" 1.2.3.4, 5.6.7.8"` yields `"1.2.3.4"`).

All of these are pure synchronous tests using `new Request("http://localhost", { headers: {...} })` — no mocking required.

**Add a new file `apps/web/src/lib/auth/__tests__/config.test.ts`** (or expand an existing auth test file if one covers `config.ts` directly):

- Mock `rateLimit` from `"@/lib/security/rate-limit"` using Vitest's `vi.mock`. Test that when the IP limiter returns `{ allowed: false }`, `authorize` returns `null` even if the email limiter would have allowed the request.
- Test that when the IP limiter is not yet exhausted and the email limiter is not exhausted, a valid credential pair results in a successful `User` return (integration-style, requires a seeded test user or a mocked `prisma.user.findUnique`).
- Test that an `X-Real-IP` of `"1.2.3.4"` produces the key `"login:ip:1.2.3.4"` passed to `rateLimit` (assert via the spy call args).

The existing `rate-limit.test.ts` tests for `rateLimit` itself (fixed-window logic, key independence, reset) are unaffected and should continue to pass without modification.
- **Risk:** **Blast radius: very low.**

The change adds one extra `Map.get` + `Map.set` call per login attempt. Latency impact is unmeasurable (nanoseconds). No database calls, no network calls, no schema changes.

**False-positive lockout risk (moderate, mitigatable):**

Setting the IP limit too low (e.g. matching the per-email limit of 5) would lock out all users behind a shared egress IP (university, office VPN, corporate NAT). The recommended limit of 20 attempts per 5 minutes per IP provides a reasonable margin. If the team operates an internal event portal where all staff log in from a single office IP, raise this to 50 — the per-account limit of 5 remains the binding safety control for credential-stuffing regardless.

**`"unknown"` key collision risk (low):**

If neither proxy header is present (direct connection, local dev without nginx), all such requests share the key `login:ip:unknown`. In local development this means the 20-attempt IP window is shared across all dev logins. This is acceptable because: (a) local dev won't hit 20 attempts casually, (b) the per-email limit of 5 still protects individual accounts. Document this in the `extractIp` JSDoc.

**Multi-instance memory isolation (documented, not new):**

The existing per-email limiter already has this gap, called out in the `rateLimit` JSDoc and compose stack (Redis is present in `compose.yaml`). This change makes the situation slightly more visible by adding a second in-memory key but introduces no new class of risk. The Redis migration remains the correct fix for both dimensions.

**Mitigation for deploy:**

No environment variable changes, no database migrations, no feature flag needed. The change is rollback-safe: reverting to the previous `config.ts` restores the old behavior completely.

### 14. Guard calendar export and Register CTA for undated and coming-soon events  _(rank 14, UI/UX, effort S)_

- **Files:** `apps/web/src/app/[locale]/(public)/events/[slug]/page.tsx`, `apps/web/src/components/public/ticket-rail.tsx`, `apps/web/src/components/public/mobile-cta-bar.tsx`, `apps/web/src/app/[locale]/(public)/events/[slug]/register/page.tsx`, `apps/web/src/lib/calendar/ics.ts`, `apps/web/src/lib/calendar/__tests__/ics.test.ts`, `apps/web/src/lib/events/__tests__/public.test.ts`
- **Approach:** **Step 1 — Fix the `calendar` object construction in the event detail page.**

File: `apps/web/src/app/[locale]/(public)/events/[slug]/page.tsx`

Line 41-46 builds:
```
const calendar = {
  title: event.titleEn,
  start: dateFrom ?? new Date().toISOString(),   // ← the bug
  ...
};
```
Change the shape so `calendar` is `CalendarEvent | null`: only construct it when `dateFrom` is non-null. Pass the nullable value down to `TicketRail` and `MobileCtaBar` (new prop `calendar: CalendarEvent | null`).

Also derive a new boolean `isComingSoon = event.comingSoon` here and pass it to both CTAs, to keep the gate logic centralized.

**Step 2 — Gate `AddToCalendar` in `TicketRail`.**

File: `apps/web/src/components/public/ticket-rail.tsx`

Change the `calendar` prop type from `CalendarEvent` to `CalendarEvent | null`.
Change the `Register` button to also accept `comingSoon: boolean`.
Render logic:
- `<AddToCalendar>` only when `calendar !== null`.
- Register `<Link>` and `<Button>`: disable (and change label to "Coming soon") when `comingSoon === true`, independent of `soldOut`. Use `aria-disabled` + pointer-events-none on the wrapping `<Link>` so keyboard navigation also respects the guard. The button precedence is: `comingSoon` → "Coming soon" (disabled) → `soldOut` → "Sold out" (disabled) → "Register" (enabled).

**Step 3 — Gate the Register CTA in `MobileCtaBar`.**

File: `apps/web/src/components/public/mobile-cta-bar.tsx`

Add `comingSoon: boolean` to the props interface.
Apply the same precedence rule: when `comingSoon` is true, render the button as disabled with label "Coming soon" and set `aria-disabled` on the wrapping `<Link>`.

**Step 4 — Hard-block registration at the page level for coming-soon events.**

File: `apps/web/src/app/[locale]/(public)/events/[slug]/register/page.tsx`

After `getPublicEvent` resolves (line 18-19), add:
```
if (data.event.comingSoon) notFound();
```
This is a server-side hard stop. Even if someone manually navigates to `/events/slug/register`, they get a 404. No changes to `registerAction` are needed — this page-level guard is the correct boundary because the action is already behind it.

**Step 5 — ICS UID and line-folding cleanups in `ics.ts`.**

File: `apps/web/src/lib/calendar/ics.ts`

Two low-severity fixes bundled because this file is already in scope:

a) **Stable UID**: replace `Math.random().toString(36).slice(2)` with a deterministic slug built from `escapeText(ev.title).slice(0, 40)` concatenated with the start timestamp. This makes UIDs reproducible across re-downloads, so calendar clients don't create duplicate entries on re-import.

b) **RFC 5545 line folding**: lines longer than 75 octets must be folded with CRLF + a single space. Add a `foldLine(s: string): string` helper that inserts `\r\n ` every 75 characters, and apply it to every content line before joining. The PRODID, SUMMARY, DESCRIPTION, and LOCATION lines are the candidates most likely to overflow.

No interface changes are needed; `CalendarEvent` stays as-is.
- **Tests:** **`apps/web/src/lib/calendar/__tests__/ics.test.ts` — extend existing suite:**

1. `buildIcs — UID is deterministic across two calls with identical input` — assert both calls produce the same UID substring (stable slug, not random).
2. `buildIcs — no line exceeds 75 octets` — iterate `ics.split("\r\n")` and assert every element has `.length <= 75`; use a long title/description fixture to exercise the folding path.
3. `buildIcs — folded continuation lines start with a space` — assert that any line starting with " " (space) is preceded by a line whose length is exactly 75.
4. `googleCalUrl — unchanged by UID/folding work` — existing test is sufficient; just re-run.

**`apps/web/src/lib/events/__tests__/public.test.ts` — extend existing suite:**

5. `getPublicEvent — returns comingSoon=true when flag is set` — mock `findFirst` returning `{ comingSoon: true, ... }`, assert `res.event.comingSoon === true`. This verifies the data contract the page relies on for its guard.

**New component-level tests (Vitest + React Testing Library or snapshots — follow the project's existing test style):**

6. `TicketRail — hides AddToCalendar when calendar is null` — render with `calendar={null}`, assert no "Add to Google" or ".ics" text in output.
7. `TicketRail — shows AddToCalendar when calendar is provided` — render with a valid `CalendarEvent`, assert links are present.
8. `TicketRail — Register button is disabled and labelled "Coming soon" when comingSoon=true` — assert button text and disabled attribute.
9. `MobileCtaBar — Register button is disabled and labelled "Coming soon" when comingSoon=true`.

**Register page (integration / e2e — follow the project's existing e2e style if present):**

10. If an e2e harness exists (see `m7.e2e.test.ts`), add a case: `register page — redirects to notFound for a comingSoon event` — mock `getPublicEvent` to return an event with `comingSoon: true` and assert the page returns 404.
- **Risk:** **Blast radius is narrow and intentional.** Only the three public-facing render files (`page.tsx`, `ticket-rail.tsx`, `mobile-cta-bar.tsx`), the register page guard, and `ics.ts` are touched. No DB schema changes, no server actions modified, no admin surfaces affected.

**Specific risks and mitigations:**

1. **Prop interface drift** — `TicketRail` and `MobileCtaBar` each gain a new required `comingSoon` prop. The only caller for both is `events/[slug]/page.tsx`, which is changed in the same PR. TypeScript will catch any missed callsite at build time.

2. **`calendar: null` propagation** — `TicketRail` accepts `CalendarEvent | null` instead of `CalendarEvent`. The `AddToCalendar` component itself is not changed; the null-check lives entirely in `TicketRail`. The `CalendarEvent` interface in `ics.ts` is unchanged, so all existing consumers (confirmation page, my-tickets, etc.) are unaffected.

3. **ICS UID determinism change** — Removing randomness from the UID means a second download of the same event overwrites rather than duplicates the calendar entry. This is the correct RFC 5545 behavior and is strictly better for end users. The risk is near-zero; the only observable behavioral difference is deduplication on re-import.

4. **ICS line folding** — RFC 5545 compliant clients already handle unfolded lines (they are technically non-conformant but tolerated). Adding folding is a strict improvement. The risk is a parser bug in the folding helper itself — mitigated by the new unit tests that assert both max-line-length and continuation-line format.

5. **Register page `notFound()` for coming-soon** — This is additive gating. A coming-soon event was never supposed to be registerable; the page just lacked the guard. The UI already disables the CTA, so no user should reach this URL via normal navigation. Direct URL manipulation returns 404, which is the intended outcome. No existing e2e tests cover this path, so there is no regression risk.

## Appendix A — Dead code (25)

| Chunk | Item | Location | Note |
|-------|------|----------|------|
| auth | rolesInOrg() | `apps/web/src/lib/auth/org-scope.ts:22-26 (exported at line 55)` | Exported but grep across all of apps/web/src finds zero import sites outside the defining file itself. No application code calls it; only defined and re-exported. |
| auth | hashPassword() | `apps/web/src/lib/auth/password.ts:10` | Exported but never imported by any non-test file. The seed script (apps/web/prisma/seed.ts:24) bypasses it, calling hash() from @node-rs/argon2 directly. Only the password.test.ts unit test imports it. |
| pretix-adapter | listQuestions / createQuestion (and their types PretixQuestion) | `apps/web/src/lib/pretix/questions.ts:10,19` | Both functions immediately throw NotImplemented. Grep confirms zero callers outside the file itself — no import from questions.ts exists anywhere in src/ other than the file itself. |
| pretix-adapter | listVouchers / createVoucher (and their type PretixVoucher) | `apps/web/src/lib/pretix/vouchers.ts:11,20` | Both functions immediately throw NotImplemented. Grep confirms zero callers outside the file itself — no import from vouchers.ts exists anywhere in src/. |
| pretix-adapter | pretixHealthCheck | `apps/web/src/lib/pretix/client.ts:114` | Exported but never imported in any production or test file outside client.ts itself. The /api/health/ready route uses validateEnv and a raw DB ping but does not call pretixHealthCheck. |
| registration-approval | export type RegistrationState | `apps/web/src/lib/approval/state.ts:7` | Exported but never imported anywhere outside its own file. The return type of registrationState() is inferred by all callers. Safe to make unexported if desired, though it is harmless as-is. |
| finance-payments | export const providers (the full registry object) | `apps/web/src/lib/payments/provider.ts:11` | Only imported in __tests__/provider.test.ts. No production route, UI component, or service imports this registry; selectProvider() is the only export that production code consumes. |
| finance-payments | export interface PaymentProviderMeta | `apps/web/src/lib/payments/provider.ts:1` | Defined solely to type the providers registry, which is itself unused in production. No external import of this interface exists outside the file. |
| finance-payments | export class WhishProvider / export interface WhishConfig | `apps/web/src/lib/payments/whish.ts:1-25` | Neither WhishProvider nor WhishConfig is imported anywhere in src/ outside the file itself. The entire module is unreachable from any live code path. (The whish-placeholder settings page and integration-service reference the string key 'whish', but not this class.) |
| seats-waitlist | canSelect (function) | `apps/web/src/lib/seats/state.ts:24` | Exported and tested in __tests__/state.test.ts but never imported by any production file. The component (seat-selector.tsx) defines its own local `selectable()` helper with different semantics; service.ts does not import canSelect either. |
| seats-waitlist | SeatLike (interface) | `apps/web/src/lib/seats/state.ts:6` | Exported but only consumed inside state.ts itself and the unit test. No production caller imports SeatLike. |
| seats-waitlist | isHoldExpired (function) | `apps/web/src/lib/seats/state.ts:12` | Exported and tested, but only imported by the unit test. No production code calls isHoldExpired directly; it is only called transitively by canSelect, which itself is dead in production. |
| checkin-staff | liveCounters (exported function) | `apps/web/src/lib/checkin/service.ts:135` | Exported but never imported outside this file. The checkin page (page.tsx:42) calls pretixCheckin.checkinCounters directly rather than going through this service wrapper. Only appears in plan/spec docs, not in any production import. |
| checkin-staff | createCheckinList (exported function) | `apps/web/src/lib/pretix/checkin.ts:22` | Only called from the e2e test scaffolding (checkin.e2e.test.ts:59). No production route, admin page, or server action invokes it. Likely intended as a provisioning helper but has no caller in the live application. |
| integrations-comms | listDeliveries (export) | `apps/web/src/lib/webhooks/admin-service.ts:78` | Exported but never imported in any page, action, or component outside its own test file. The webhook dashboard page calls only listWebhooks; no delivery history UI or action invokes this function. |
| integrations-comms | decryptField (export) | `apps/web/src/lib/integrations/secrets.ts:9` | Exported from secrets.ts but no production-code caller (service, route, or action) imports it. Used only in the integration test suite. If stored secrets need to be read back (e.g. for SMTP), callers use lib/crypto directly. |
| external-api-v1 | hashesEqual | `apps/web/src/lib/api/keys.ts:30` | Exported but never imported outside its own test file (apps/web/src/lib/api/__tests__/keys.test.ts). Production auth uses hashKey+prisma findUnique (not a direct hash comparison), so this function has no non-test caller. |
| external-api-v1 | webhooks:manage scope | `apps/web/src/lib/api/scopes.ts:10` | Declared in the SCOPES constant and therefore part of the Scope union type, but no v1 route, no admin-service function, and no key-manager UI passes or checks this scope. It is never passed as the required argument to withApi or hasScope in any non-test file. Only appears in the keys.test.ts fixture. |
| admin-ui | local `resolveOrgId` in settings/webhooks/page.tsx (lines 9-16) | `apps/web/src/app/[locale]/(admin)/admin/settings/webhooks/page.tsx:9` | Duplicates `lib/admin/resolve-org.ts::resolveOrgId` verbatim. The canonical export is imported and used by the three integrations pages but not by this file, so the inline copy is redundant dead-local code. |
| admin-ui | local `resolveOrgId` in settings/api-keys/page.tsx (lines 9-16) | `apps/web/src/app/[locale]/(admin)/admin/settings/api-keys/page.tsx:9` | Same duplication as the webhooks page. The shared `lib/admin/resolve-org.ts` export is never imported here; this local copy should be replaced with the shared import. |
| public-ui | CardAction, CardFooter, CardDescription — exported from card.tsx but never imported by any file in the codebase | `apps/web/src/components/ui/card.tsx:59-103` | Grep across the entire src tree finds zero usages of CardAction, CardFooter, or CardDescription outside the component file itself. The only consumer (login-form.tsx) imports only Card, CardHeader, CardTitle, and CardContent. |
| public-ui | buttonVariants — exported from button.tsx but has no consumer | `apps/web/src/components/ui/button.tsx:58` | Grep for 'buttonVariants' in the src tree finds only the definition file. No external import was found in admin, public, or registration components. |
| public-ui | EventCardData interface — exported from event-card.tsx but never imported elsewhere | `apps/web/src/components/public/event-card.tsx:3` | The callers (events/page.tsx) pass an inline object literal matching the shape; they never import the EventCardData type. The export is structurally redundant. |
| public-ui | RailTicket interface — exported from ticket-rail.tsx but never imported elsewhere | `apps/web/src/components/public/ticket-rail.tsx:8` | No file outside ticket-rail.tsx imports RailTicket. The caller (events/[slug]/page.tsx) constructs the prop inline. |
| cross-cutting | isEmailDisabledInProduction | `apps/web/src/lib/config/env.ts:128` | Exported but never imported anywhere outside its own file. The email/service.ts module implements the equivalent logic directly via emailMode() by checking process.env.SMTP_HOST and NODE_ENV at call time. No route, action, or test imports this export. |

## Appendix B — Unwired features (33)

| Chunk | Feature | Note |
|-------|---------|------|
| auth | impersonating flag in SessionContext | The impersonating field is declared in types.ts and hardcoded to false in getSessionContext() (session.ts:26). Service-layer guards (finance, approval, checkin, archive, webhooks, api-keys, integrations) all check session.impersonating and throw ForbiddenError when true, but there is no UI, route, or server action that can ever set it to true. The full impersonation feature is built into the permission layer but has no entry point. |
| pretix-adapter | pretixHealthCheck in /api/health/ready | pretixHealthCheck() (client.ts:114) is defined and exported to allow the readiness probe to verify pretix reachability, but /api/health/ready/route.ts only checks config validity and database connectivity. A misconfigured or unreachable pretix instance is invisible to the readiness probe and to operators monitoring the health endpoints. |
| pretix-adapter | createCheckinList | checkin.ts:22 — createCheckinList is exported and has a real pretix implementation, but it is only invoked from an e2e test helper (checkin.e2e.test.ts:59). No production code path calls it; provisioning a new event via events/service.ts does not create a check-in list in pretix, meaning a freshly created event has no pretix check-in list until one is manually added via the pretix admin UI or the e2e test is run against a live instance. |
| pretix-adapter | questions.ts and vouchers.ts stub modules | Both files define typed interfaces and exported function signatures but throw NotImplemented synchronously. They are not imported by any route, service, or UI component, making them invisible dead-end stubs rather than wired-but-unfinished capabilities. |
| registration-approval | phone / phoneCC attendee fields | registerInputSchema (schema.ts:11-12) validates and requires phoneCC and phone as non-empty strings, but service.ts never reads them and AttendeeOrder has no corresponding DB columns (confirmed against prisma/schema.prisma). The data is validated on every registration and then silently discarded — it is never stored, forwarded to pretix, or surfaced in the admin UI. |
| registration-approval | approvalMode: 'automatic' (per-item auto-approve in requiresApproval) | requiresApproval (state.ts:37) treats 'automatic' identically to 'none' — no manual hold. The related 'manual_and_automatic' path does per-item auto-approve exclusion via autoApproveItemIds. However, no code path actually sets approvalMode to 'automatic' on an EventMapping, and the pretix webhook does not trigger the automatic issuance side of that mode (e.g. no call to approve() on webhook order.paid). The 'automatic' enum variant is therefore effectively inert in the live flow. |
| finance-payments | WhishProvider.testConnection() / isConfigured() | The WhishProvider class in lib/payments/whish.ts has testConnection() and isConfigured() methods, but no caller exists anywhere in production code. The integration-settings page (whish-placeholder/page.tsx) and integrations-service.ts reference the 'whish' key as a string but never instantiate or invoke WhishProvider. This is the documented deferred Whish live-payment integration — recorded here because whish.ts is part of this chunk's scope. |
| seats-waitlist | canSelect / isHoldExpired client-side expired-hold rendering | state.ts exports canSelect to allow UIs to re-derive selectability from a locally cached seat including expired holds. SeatSelector does not use it; the component shows expired-hold seats as amber/taken and blocks selection until the user reloads. The logic is there but never wired into any UI update path. |
| seats-waitlist | Per-ticket waitlist (itemId field) | joinWaitlist accepts a non-null itemId (lib/waitlist/service.ts:11) and the POST /api/v1/events/[id]/waitlist passes body.itemId. However the public WaitlistJoin component (components/public/waitlist-join.tsx) and the server action (waitlist-actions.ts:21) always pass itemId=null. The per-ticket dimension is stored in the schema but never surfaced in any UI or admin flow. |
| seats-waitlist | Automated waitlist promotion (cleanup/retryDue) | Listed as a known deferred item — promotion is admin-manual only. No cron/scheduler triggers auto-promotion when a seat is released. |
| checkin-staff | BadgePrintLog.reprint field | The schema column reprint: Boolean exists in BadgePrintLog and is exposed in checkinDTO. Both write sites (service.ts:106 and route.ts:59) always hardcode reprint: false. The 'Print / reprint badge' button in badge-print-dialog.tsx (line 27) calls window.print() client-side with no server action, so reprints are never recorded. The column carries no signal in any deployed scenario. |
| checkin-staff | Multi-list selector (pretix check-in lists) | listCheckinLists can return multiple lists per event, and the page reads a ?list= query param to select one (page.tsx:39). However there is no UI control to switch lists — neither the staff home page nor the checkin page renders a list selector. Staff can only switch lists by manually editing the URL. Events with more than one check-in list are silently served the first list returned. |
| events-calendar | live flag on updateEvent | EventInput.live (schema.ts:22) is collected by the event form (event-form.tsx:114) and forwarded through createEventAction → service.createEvent → pretixEvents.createEvent (live: input.live). However service.updateEvent (service.ts:176-181) passes only { titleEn, titleAr, date_from } to pretixEvents.updateEvent — input.live is silently dropped. An admin who ticks or un-ticks 'Live (published in pretix)' when editing an existing event has no effect on pretix; the live state can only be set at creation time. |
| events-calendar | Public listing does not gate on pretix live flag | listPublicEvents and getPublicEvent (public.ts:31, 45) filter only on local visibility='public'. They do not check whether the corresponding pretix event has live:true. An event can therefore appear in the public storefront even while pretix has it set to live:false (e.g. immediately after createEvent with live:false). This is a design inconsistency — the local visibility field and the pretix live flag are independent but overlapping controls with no reconciliation. |
| integrations-comms | SmsProvider and WhatsAppProvider (lib/notify) | Both implement MessageProvider but are never imported anywhere outside their own modules. No service, action, or route instantiates or calls them. They are pure stubs with no caller in the live flow. (Deferred per roadmap; flagged here because they are structurally unwired.) |
| integrations-comms | retryDue() webhook retry function | apps/web/src/lib/webhooks/service.ts:97 — Exported but has no caller outside its test file. No cron entrypoint, admin action, or API route invokes it. Failed deliveries accumulate nextRetryAt timestamps that are never processed. (Consistent with the known-deferred cron/scheduler item.) |
| integrations-comms | listDeliveries() webhook delivery history | apps/web/src/lib/webhooks/admin-service.ts:78 — The service method exists but no admin UI page, server action, or API route calls it, so delivery history is invisible to operators. (Consistent with the known-deferred webhook delivery dashboard.) |
| integrations-comms | Inbound pretix webhook action dispatch | apps/web/src/app/api/webhooks/pretix/route.ts:10 — The POST handler verifies the secret and logs the event but dispatches no further action. No order sync, attendee state update, or local event trigger fires on receipt. |
| integrations-comms | attendee.created and seat.released webhook events | apps/web/src/lib/webhooks/events.ts:2,14 — Both are declared in WEBHOOK_EVENTS and subscribable, but no emit() call in any service fires them. attendee.created is never emitted; seat.released has no emit call anywhere in the codebase. |
| integrations-comms | testSmtpAction SMTP live-send | apps/web/src/app/[locale]/(admin)/admin/settings/integrations/actions.ts:29 — In production the action records a failure unconditionally without attempting a real send via sendEmail(), so the Test button never exercises the live SMTP transport even when SMTP_HOST is configured. |
| external-api-v1 | webhooks:manage scope (API key permission) | The scope exists in scopes.ts but there is no /api/v1/webhooks route and no admin-service function that checks or uses it. A key could be granted this scope but it would grant nothing beyond an ordinary key. |
| external-api-v1 | Waitlist auto-promotion via POST /api/v1/events/[id]/waitlist | joinWaitlist is called correctly, but the deferred cron/scheduler that would promote waitlisted entries into registrations is not wired. The write side of the scope (waitlist:write) therefore creates entries that remain indefinitely unless an admin manually triggers promotion. |
| admin-ui | Registrations nav link (`/registrations`) in admin sidebar | layout.tsx line 14 adds a 'Registrations' nav entry pointing to `/[locale]/admin/registrations`, but no corresponding `app/[locale]/(admin)/admin/registrations` directory or page.tsx exists. Clicking the link produces a Next.js 404. |
| admin-ui | Staff nav link (`/staff`) in admin sidebar | layout.tsx line 16 adds a 'Staff' nav entry pointing to `/[locale]/admin/staff`, but no corresponding page exists under the admin route group. Clicking the link produces a 404. (The checkin staff interface lives in the separate `(staff)` route group, not under `/admin/staff`.) |
| admin-ui | Settings nav link (`/settings`) in admin sidebar | layout.tsx line 17 adds a 'Settings' nav entry pointing to `/[locale]/admin/settings`, but there is no `page.tsx` at `app/[locale]/(admin)/admin/settings/`. Only child pages (api-keys, webhooks, integrations) exist. The link lands on a 404; there is no settings index/landing page. |
| admin-ui | `testSmtpAction` — SMTP 'Send test' button never sends real mail | actions.ts line 30 sets `ok = process.env.NODE_ENV !== 'production'`, so in production the action always returns `ok: false` with 'SMTP not configured' without ever attempting an actual SMTP connection or calling `emailMode()`/`sendEmail()`. The UI presents a 'Send test' button that permanently fails in production regardless of whether SMTP is configured. |
| admin-ui | `testIntegrationAction` — always returns 'not implemented' for all providers | actions.ts line 56-63 records a test failure for every provider with the message `${provider}_not_implemented`. The WhatsApp/SMS/Whish providers are deferred roadmap items (expected), but the pretix provider also goes through this path even though pretix is fully operational. There is no live test path for pretix from the integrations UI. |
| public-ui | Phone + country-code collected in RegistrationWizard (step 0) and declared in registerInputSchema, but never stored in AttendeeOrder or forwarded to pretix | PhoneCountryField collects phoneCC and phone; registerAction passes them to register(); register() parses them via registerInputSchema (schema.ts:11-12). However, the prisma.attendeeOrder.create() call in service.ts:120-138 never writes phone or phoneCC — the AttendeeOrder model has no phone columns. The values are also not forwarded to pretixOrders.createOrder(). The phone data is silently discarded after validation. |
| public-ui | consentTerms / consentPrivacy collected and validated in wizard and schema, but not persisted or audited | Both consent fields are required to be literal true (schema.ts:19-20) and the server action validates them, but register() in service.ts never writes them to the database. There is no consent audit trail — no column, no audit log entry, and no webhook event. |
| public-ui | locationLabel prop on EventHero is always passed as null | EventHero declares locationLabel: string | null (event-hero.tsx:9) and renders a 📍 location pill when truthy (line 25). The sole caller (events/[slug]/page.tsx:53) hard-codes locationLabel={null}. The EventMapping model and getPublicEvent() expose no location field, so this prop can never display anything. |
| public-ui | comingSoon events are accessible through the /register route | TicketRail and MobileCtaBar correctly disable the Register button when soldOut=true, but there is no equivalent guard for comingSoon=true. The register/page.tsx calls getPublicEvent() which returns a result for comingSoon events (visibility=public filter only), and the RegistrationWizard is rendered unconditionally. A user who navigates directly to /events/<slug>/register for a comingSoon event can submit a registration. |
| cross-cutting | archive() — queue a record for soft-archival | apps/web/src/lib/archive/service.ts:39. The archive() function creates ArchiveQueue rows (the entry-point to the purge lifecycle) but is never called from any app route or server action. Only the downstream management operations (restore, cancelPurge, markPurged, listQueue) are wired into the delete-queue admin UI. This means no entity in the system can ever be queued for archival through the live application; the queue can only be populated manually or via tests. |
| cross-cutting | cleanup() — automatic expiry of 14-day retention window | apps/web/src/lib/archive/service.ts:129. cleanup() scans for ArchiveQueue rows past their purgeAfter date and purges their local snapshots. It has no route, action, or cron caller in production code. This is consistent with the known deferred 'Cron/scheduler wiring' roadmap item, but is noted here because cleanup() is in this chunk's scope and the deferred item explicitly calls out only waitlist/webhook retries — archive cleanup was not listed separately. |

## Appendix C — Chunk coverage map

**auth** — This chunk implements all authentication and session-authorization primitives for the Strawberry Events platform. It provides credentials-based sign-in via Auth.js v5 (JWT strategy, argon2id password hashing, in-memory rate limiting), resolves a typed SessionContext (userId, isSuperAdmin, memberships) from the JWT on every server request, and exposes role-guard helpers (hasAnyRole, assertRole, requireRole) consumed by every admin/staff route and service layer. It also manages the super-admin active-organization cookie and supplies org-scoped Prisma where-fragment builders used by the event, finance, and approval services. _(issues: 3, dead: 2, unwired: 1)_

**pretix-adapter** — This chunk is the boundary layer between the Strawberry Events platform and the self-hosted pretix ticketing backend. It provides: (1) a single authenticated HTTP transport (client.ts) that all other adapter modules must route through; (2) per-resource modules (events, products, orders, checkin, webhooks) that map pretix REST responses to typed platform DTOs; (3) a context resolver (context.ts) that decrypts per-organizer API tokens or falls back to an env token; and (4) i18n and price helpers (mappers.ts) shared across modules. The questions.ts and vouchers.ts modules exist as typed stubs that throw NotImplemented and are not wired to any caller. _(issues: 3, dead: 3, unwired: 3)_

**registration-approval** — This chunk owns the entire public registration flow and the admin approval pipeline. lib/registration/service.ts is the single entry point for attendee self-registration: it re-prices tickets from pretix, holds/confirms seats, creates the pretix order, persists an AttendeeOrder, issues a magic-link token, and sends the correct transactional email based on whether approval is required or the order is free. lib/approval/service.ts provides organizer-admin-gated approve/reject operations with atomic TOCTOU guards, pretix synchronisation, seat release on rejection, audit logging, and best-effort email delivery. lib/approval/state.ts is a pure-function layer that derives the attendee-facing registration state and evaluates whether a given event+item combination needs manual approval; it is shared by both halves of the chunk and by the check-in eligibility layer. _(issues: 4, dead: 1, unwired: 2)_

**finance-payments** — This chunk implements the manual/COD order-settlement flow and the payment-provider abstraction layer. lib/finance provides the service functions (list, get, mark-paid) that back the admin finance dashboard and the mark-paid server action, plus a thin isTicketIssued predicate used for idempotency. lib/payments declares the provider registry (COD enabled, Whish disabled) and selectProvider() which the registration service calls to decide whether a new order needs payment. A WhishProvider placeholder class exists as a wiring point for a future live-payment integration. _(issues: 2, dead: 3, unwired: 1)_

**seats-waitlist** — This chunk manages two related concerns: (1) seat reservations for seated events — holding seats for a timed window during registration, confirming them against a pretix order, and releasing them on cancellation/rejection; (2) a waitlist system that lets users join a queue when an event is full, with admin-driven promotion that emails the promoted person a registration link. The seat service is consumed by the registration flow and the approval/rejection flow. The waitlist service is surfaced via both a public-facing server action and an admin UI page, as well as the REST API. _(issues: 3, dead: 3, unwired: 3)_

**checkin-staff** — This chunk implements the staff-facing check-in flow for Strawberry Events. It exposes a server-rendered page at /[locale]/staff/checkin (gated to checkin_staff, organizer_admin, and super_admin roles) that lets staff search attendees by order code or email, redeem them against the pretix check-in list (source of truth), log a BadgePrintLog row, emit audit and webhook events, and render a thermal badge for printing. The service layer (lib/checkin/service.ts) and eligibility logic (lib/checkin/eligibility.ts) are also consumed by the REST API route at /api/v1/events/[id]/checkins for API-key-based check-in. The badge components (BadgeTemplate, BadgePrintDialog) render a 4×6 thermal badge with role-color tag, name, company, and QR code. _(issues: 3, dead: 2, unwired: 2)_

**events-calendar** — This chunk implements three related concerns. `lib/events/service.ts` is the authenticated admin service layer for creating, reading, and updating events and tickets — it writes to both pretix (source of truth for dates/live status) and the local EventMapping/PretixObjectMapping tables, enforces the organizer-admin/super-admin role gate (H3), and emits audit log entries. `lib/events/public.ts` serves the unauthenticated storefront: it fetches public EventMappings from the DB, enriches them with pretix ticket/quota/date data, and aggregates sold/available capacity. `lib/events/capacity.ts` and `lib/events/schema.ts` are pure utilities — a capacity classifier and the Zod input schemas for both event and ticket forms. `lib/calendar/ics.ts` generates downloadable `.ics` files and Google Calendar deep-links from a generic CalendarEvent shape, consumed by the public event-detail page via the AddToCalendar component. _(issues: 5, dead: 0, unwired: 2)_

**integrations-comms** — This chunk implements the outbound-communications and integration-configuration layer for the platform. It covers: (1) encrypted storage and admin UI for third-party integration credentials (SMTP, WhatsApp, SMS, Whish, pretix) via lib/integrations; (2) a thin email abstraction over nodemailer with bilingual (en/ar) plain-text templates wired into registration, approval, waitlist, and finance flows via lib/email; (3) placeholder stub providers for WhatsApp and SMS that structurally implement a MessageProvider interface but do not send anything via lib/notify; (4) an outbound webhook fan-out system (emit/deliver/retryDue) and admin CRUD service for managing org-scoped webhooks via lib/webhooks; and (5) an inbound pretix webhook endpoint that verifies the shared secret and currently only logs the event. _(issues: 4, dead: 2, unwired: 6)_

**external-api-v1** — This chunk implements the public REST API (v1) that external integrators use to read event/attendee/order/seat/waitlist data and perform write operations (register attendees, record check-ins, join waitlist). It is authenticated with per-key Bearer tokens (SHA-256 hashed, scope-checked, rate-limited), managed via lib/api — a self-contained auth/key/rate-limit/response/serializer layer. The magic-link token library (lib/tokens) is also included here; it signs per-order HMAC tokens used for the attendee self-service flow and is called by the registration service, not by the v1 API directly. Three health endpoints (liveness, DB-readiness, full-readiness) round out the chunk. _(issues: 5, dead: 2, unwired: 2)_

**admin-ui** — The admin-ui chunk provides the full back-office interface for Strawberry Events. It covers event creation/editing, ticket management, manual approval/rejection of orders, finance (mark-paid for COD orders), waitlist promotion, audit-log browsing, archive/delete-queue management, API-key and outbound-webhook CRUD, and per-organization integration configuration (SMTP, pretix, WhatsApp, SMS, Whish). All pages sit under `app/[locale]/(admin)/admin`, are guarded by `requireRole`, and delegate mutations to service-layer functions via Next.js Server Actions. A shared `lib/admin/resolve-org.ts` centralises org resolution for the integrations pages. _(issues: 4, dead: 2, unwired: 5)_

**public-ui** — This chunk is the attendee-facing public surface of the Strawberry Events platform. It exposes a storefront listing page, an event detail page with a ticket rail and waitlist join, a three-step registration wizard backed by a pretix-integrated server action, and post-registration state pages (confirmation with QR code and payment-pending). Supporting components cover availability visualization, calendar export (ICS + Google Calendar), theme toggling, and language switching. The chunk is the sole entry point through which a public user discovers events, registers, and retrieves their ticket via magic-link token. _(issues: 4, dead: 4, unwired: 4)_

**cross-cutting** — This chunk provides the shared infrastructure used across the entire Strawberry Events platform. It covers: i18n locale/direction configuration (en/ar, LTR/RTL); dark-mode theme resolution; production environment fail-fast validation; AES-256-GCM encryption/decryption for stored secrets; constant-time secret comparison; HTTP security response headers (CSP, HSTS, framing policy); an in-memory fixed-window rate limiter; a central audit-log writer and query service; a soft-archive/purge queue service; and the singleton Prisma client. Together these modules enforce correct startup posture, protect every HTTP response, and provide the observability and data-lifecycle primitives consumed by other feature modules. _(issues: 3, dead: 1, unwired: 2)_
