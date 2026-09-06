-- Widen two CHECK constraints so forward-linking can record itself.
--
-- This is the payoff for choosing CHECK over enum in
-- 20260905074701_add_merge_ledger: Postgres cannot drop an enum value, but a
-- CHECK can be replaced with a wider one. Widening is expand-compatible — an
-- older build writes only the previous values, and every one of them still
-- passes — so this is safe under the deploy ordering where a failed health
-- check rolls the image back over an already-migrated schema.
--
-- No existing row changes, and no row can violate the new constraints, since
-- both are supersets of what they replace.

-- `system`: neither a person claiming nor an operator deciding. Forward-linking
-- has no human in the loop — the system infers ownership from an address the
-- account already proved.
ALTER TABLE "account_merge_events"
  DROP CONSTRAINT "account_merge_events_actorType_check";
ALTER TABLE "account_merge_events"
  ADD CONSTRAINT "account_merge_events_actorType_check"
  CHECK ("actorType" IN ('self_claim', 'staff_override', 'system'));

-- `forward_link`: the registration arrived carrying an address already verified
-- on an account.
ALTER TABLE "account_merge_events"
  DROP CONSTRAINT "account_merge_events_proofType_check";
ALTER TABLE "account_merge_events"
  ADD CONSTRAINT "account_merge_events_proofType_check"
  CHECK ("proofType" IN ('admin_override', 'magic_link', 'email_code', 'phone_code', 'forward_link'));

-- The staff-accountability rule is unchanged and still applies only to
-- staff_override, so `system` events legitimately carry no operator and no
-- reason. Restated here so the widening above cannot be read as relaxing it.
