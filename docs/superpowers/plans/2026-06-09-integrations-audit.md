# Integrations + Audit + Archive (Milestone 11) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Integration settings (encrypted secrets), audit log UI + coverage hardening, archive/delete queue with 14-day retention + cleanup, reminder-settings foundation.

Spec: `docs/superpowers/specs/2026-06-09-integrations-audit-design.md`

---

## Chunk 1: schema

### Task 1
- [ ] Extend `SmtpSetting` (replyTo/lastTestedAt/lastError/updatedByUserId), `IntegrationSetting` (lastTestedAt/lastError/updatedByUserId), `AuditLog` (impersonatedUserId, success), `ArchiveQueue` (organizationId/eventMappingId/targetName/requestedByUserId/reason/status/restoredAt/canceledAt) + `ArchiveStatus` enum; new `ReminderSetting`. Migration `add_integrations_audit_archive` (dev :5433); regen client. Commit.

---

## Chunk 2: integration services + provider interfaces (TDD)

### Task 2: secret helpers + provider interfaces
- [ ] `lib/integrations/secrets.ts` (encryptField/decryptField/redact). `lib/notify/types.ts` (MessageProvider), `lib/notify/whatsapp.ts` + `lib/notify/sms.ts` placeholders, `lib/payments/whish.ts` placeholder. Tests (encrypt round-trip, redaction). Commit.

### Task 3: smtp + integration services (TDD)
- [ ] `lib/integrations/smtp-service.ts` (get/save/test) + `integration-service.ts` (get/save/test generic). Guards (assertCanEditIntegration: super/organizer; finance view-only; checkin none; impersonating none; cross-org denied). Secrets encrypted, never returned. Audited. Tests. Commit.

---

## Chunk 3: audit service + coverage hardening (TDD)

### Task 4: audit record + query
- [ ] `lib/audit/service.ts`: `record(...)`, `query(session, filters)` (org/event/actor/action/type/date/success/impersonation), `getEntry` (org-isolated). Tests (filters, isolation). Commit.

### Task 5: coverage hardening
- [ ] Add audits where missing: COD mark-paid (finance), badge print/reprint, seat held/confirmed/released, waitlist joined/canceled, integration/smtp (done in C2). Use `record`. Tests assert audit rows. Commit.

---

## Chunk 4: archive/delete queue + cleanup (TDD)

### Task 6
- [ ] `lib/archive/service.ts`: archive/restore/cancelPurge/markPurged/listQueue + `cleanup()`. Guards (finance no purge, checkin none, impersonating none, cross-org denied). Never hard-deletes; skips pretix. Tests (queues not deletes; restore<14d; purge skips pretix; impersonating cannot; cleanup marks eligible). Commit.

---

## Chunk 5: admin UI

### Task 7: integrations hub + sub-pages
- [ ] `/admin/settings/integrations` hub + `/smtp /whatsapp /sms /whish-placeholder /pretix` forms (secrets write-only, test buttons) + reminder settings. Actions. Build. Commit.

### Task 8: audit + delete-queue pages
- [ ] `/admin/audit` (filters + detail) + `/admin/delete-queue` (list + restore/cancel/purge, role-gated). Actions. Build. Commit.

---

## Chunk 6: verify + docs

### Task 9
- [ ] Integration test (real DB): smtp secret encrypted+not-returned; archive queues+restore; cleanup marks eligible; audit query isolation. lint+typecheck+test+smoke+build green. README docs. Commit.

---

## Notes
- DRY: central `audit.record`, `assertCanEditIntegration`, secret helpers. YAGNI: no live messaging, no real cron, no audit export.
- Secrets always encrypted; never returned decrypted; pretix token never shown. HTTP DELETE stays 405. pretix orders never hard-deleted.
