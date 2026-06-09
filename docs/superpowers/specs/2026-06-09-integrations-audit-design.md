# Milestone 11 — Integrations + Audit + Archive/Delete Queue Design

**Date:** 2026-06-09
**Status:** Scope confirmed (per owner brief)
**Depends on:** M1–M10.

---

## 1. Goal

Operational admin layer: integration settings (SMTP/WhatsApp/SMS/Whish/pretix) with
encrypted secrets, an audit log UI, a safe archive/delete queue with 14-day retention +
cleanup, and a reminder-settings foundation.

## 2. Schema

Reuse `IntegrationSetting` (org, provider, enabled, config Json) for whatsapp/sms/whish +
test metadata. Extend:
- `SmtpSetting`: add `replyTo String?`, `lastTestedAt DateTime?`, `lastError String?`,
  `updatedByUserId String?`.
- `IntegrationSetting`: add `lastTestedAt DateTime?`, `lastError String?`, `updatedByUserId String?`.
- `AuditLog`: add `impersonatedUserId String?`, `success Boolean @default(true)` (filterable).
- `ArchiveQueue`: add `organizationId String?`, `eventMappingId String?`, `targetName String?`,
  `requestedByUserId String?`, `reason String?`, `status ArchiveStatus @default(queued)`,
  `restoredAt DateTime?`, `canceledAt DateTime?`. Enum `ArchiveStatus { queued restored purged canceled }`.
- New `ReminderSetting`: `id, eventMappingId?, organizationId, emailEnabled, whatsappEnabled,
  smsEnabled, offsets Int[] (minutes-before), createdAt, updatedAt`.
Secrets are stored **encrypted** (AES-256-GCM via `lib/crypto`) inside `config`/`passwordEnc`.
Migration `add_integrations_audit_archive`.

## 3. Encryption + secret hygiene

Reuse `encrypt`/`decrypt`. Secrets (SMTP password, WhatsApp/SMS/Whish tokens, pretix token)
are encrypted at rest. APIs/UI **never return decrypted secrets** — only a
`{ configured: boolean }` flag and non-secret fields. pretix raw token never shown.

## 4. Integration services (`lib/integrations/*`)

- `smtp-service.ts`: `getSmtp(session,orgId)` (no secret), `saveSmtp(...)` (encrypts password,
  audits integration.updated), `testSmtp(...)` (sends test email via nodemailer or dev-log
  fallback in dev; records lastTestedAt/lastError; audits smtp.test_sent/failed).
- `integration-service.ts`: generic `getIntegration(provider)` / `saveIntegration(provider,
  config, secrets)` / `testIntegration(provider)` for whatsapp/sms/whish/pretix. Encrypts
  flagged secret fields; returns `configured` flags only. Audited.
- Provider interfaces: `lib/notify/whatsapp.ts` + `lib/notify/sms.ts` (`interface MessageProvider
  { send(to, body): Promise<Result> }`) with a `NotConfigured`/`Placeholder` impl. Whish:
  `lib/payments/whish.ts` placeholder provider behind existing PaymentProvider abstraction.

## 5. Audit (`lib/audit/*`)

- `record(...)` helper centralizing AuditLog writes (actor, impersonatedUserId, org/event,
  action, entityType/id, before/after, success, ip/ua). Replace ad-hoc `auditLog.create`
  calls over time; new code uses it.
- `query(session, filters)`: org/event/actor/action/entityType/date-range/success/
  impersonation-only. Org isolation: non-super restricted to their org(s).
- `getEntry(session, id)`: org-isolated detail.
- **Coverage hardening**: ensure audits for integration created/updated/tested, smtp test,
  COD mark-paid, badge print/reprint, seat held/confirmed/released, waitlist canceled,
  archive/restore/purge, impersonation start/stop. (API key/webhook/approval/check-in already audited.)

## 6. Archive/delete queue (`lib/archive/*`)

- `archive(session, {entityType, entityId, targetName, organizationId, eventMappingId, reason})`:
  snapshot payload, `purgeAfter = now + 14d`, status queued; audit archive.queued. **Never hard
  deletes**; pretix orders are never destructively deleted (cancel/status only — documented).
- `restore(session, id)` (before purge): status restored; audit.
- `cancelPurge(session, id)`: status canceled; audit.
- `markPurged(session, id)` / cleanup purges **local snapshot only**; audit purge/skip.
- `listQueue(session, filters)` org-scoped.
- `cleanup()` service: find queued with `purgeAfter <= now` → eligible; purge local snapshot,
  set purgedAt/status purged; audit each; **skips pretix destructive delete**. Exposed as an
  admin action + documented cron.

## 7. Permissions

Integrations: super (all), organizer_admin (their org). Finance may **view** finance-related
status but not edit secrets (unless granted) → `assertCanEditIntegration`. Check-in staff
cannot. Impersonating cannot modify integrations/secrets/archive/audit. Cross-org denied.
Archive: super all; organizer_admin archive/restore own; **finance cannot purge**; check-in
cannot archive/delete/purge; impersonating cannot. HTTP DELETE stays 405.

## 8. Admin UI

`/admin/settings/integrations` (hub: status/configured/lastTested/lastError per provider) +
`/smtp`, `/whatsapp`, `/sms`, `/whish-placeholder`, `/pretix` sub-pages (forms; secrets
write-only; test buttons). `/admin/audit` (filters + detail view, org-isolated).
`/admin/delete-queue` (queue list + restore/cancel/purge actions, role-gated). Reminder
settings under integrations (email/whatsapp/sms toggles + offset placeholders 24h/1h).

## 9. Tests

SMTP secret encrypted + not returned; smtp test success/failure audited; whatsapp/sms/whish
secrets encrypted; finance cannot edit integrations; check-in cannot; impersonating cannot;
cross-org denied; audit query filters by org/event/action; audit detail org-isolated; archive
queues (no hard delete); restore before 14d; purge skips pretix; impersonating cannot purge;
DELETE 405; cleanup marks eligible; existing actions still audit.

## 10. Docs

README: integrations, SMTP setup, WhatsApp/SMS/Whish placeholder architecture, pretix per-org
settings, audit usage, archive/delete + 14-day retention, cleanup/cron notes.

## 11. Out of scope

Live WhatsApp/SMS/Whish sending, real reminder scheduling (config model only), audit log
export, automatic background cron (manual admin action + documented cron).
