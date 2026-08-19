-- Badge contact profile: a QR on the printed badge resolving to a branded page.
--
-- Every statement is idempotent. The migration is pre-applied to production
-- BEFORE the image ships, because CI recreates the container and only then runs
-- `migrate deploy` — and getSessionContext selects from this table on every
-- authenticated request, so the gap would 500 the whole app, check-in included.
ALTER TABLE "attendee_orders"
  ADD COLUMN IF NOT EXISTS "badgeSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "badgeProfileRevokedAt" TIMESTAMP(3);

-- Not idempotent by default — a plain CREATE UNIQUE INDEX fails on re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "attendee_orders_badgeSlug_key"
  ON "attendee_orders"("badgeSlug");

-- Backfill GUARDED on NULL. Without the guard a second run rotates every slug,
-- 404-ing every badge already printed — the exact failure the stored-not-derived
-- design exists to prevent.
--
-- 8 chars of Crockford base32 (no I, L, O, U — they misread on a printed badge
-- and this is a fallback someone may type). ~40 bits over 812 rows.
UPDATE "attendee_orders"
SET "badgeSlug" = (
  SELECT string_agg(
    substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (floor(random() * 32) + 1)::int, 1),
    ''
  )
  FROM generate_series(1, 8)
)
WHERE "badgeSlug" IS NULL;
