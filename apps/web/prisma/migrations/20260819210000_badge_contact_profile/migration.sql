-- Badge contact profile: a QR on the printed badge resolving to a branded page.
--
-- Every statement is idempotent.
--
-- PRE-APPLY THIS BEFORE THE IMAGE SHIPS. CI recreates the app container and
-- only then runs `migrate deploy`, so between those two steps new code runs
-- against the old schema. Prisma emits explicit column lists, so any query
-- reading AttendeeOrder without a narrowing `select` will 500 on the missing
-- columns — including `listMyRegistrations`, which backs the "My Tickets" page
-- for every attendee, and the admin registrations list.
ALTER TABLE "attendee_orders"
  ADD COLUMN IF NOT EXISTS "badgeSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "badgeProfileRevokedAt" TIMESTAMP(3);

-- Not idempotent by default — a plain CREATE UNIQUE INDEX fails on re-run.
--
-- Deliberately NOT CONCURRENTLY: at ~812 rows this builds in milliseconds, and
-- CONCURRENTLY cannot run inside the transaction Prisma wraps around this file.
-- A plain build takes SHARE (blocking writes, not reads) for that instant.
CREATE UNIQUE INDEX IF NOT EXISTS "attendee_orders_badgeSlug_key"
  ON "attendee_orders"("badgeSlug");

-- Backfill, one distinct slug per row.
--
-- This MUST be a procedural loop, not `UPDATE ... SET x = (SELECT ...)`.
-- A scalar subquery that references no outer column is uncorrelated, so the
-- planner hoists it into an InitPlan and evaluates it ONCE for the whole
-- statement — `random()` inside it does not change that. Verified against this
-- exact Postgres 16.15: the subquery form produced 812 rows with 1 distinct
-- value. With the unique index above it aborts on the second row; without it,
-- all 812 attendees would share one badge slug and one profile page.
--
-- Inside plpgsql each iteration re-executes the SELECT, so it is genuinely
-- per-row. The inner loop retries on the (vanishingly rare) collision so the
-- unique index can never abort the migration.
--
-- Guarded on NULL: a second run must not rotate a slug already printed onto a
-- badge someone is wearing. Verified — re-running changes 0 rows.
--
-- 8 chars of Crockford base32 minus I, L, O, U: those misread on a thermal
-- badge, and this is a fallback someone may have to read aloud or type.
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN SELECT "id" FROM "attendee_orders" WHERE "badgeSlug" IS NULL LOOP
    LOOP
      SELECT string_agg(
               substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
        INTO candidate
        FROM generate_series(1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "attendee_orders" WHERE "badgeSlug" = candidate);
    END LOOP;
    UPDATE "attendee_orders" SET "badgeSlug" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;
