-- A catch-all role whose band text the operator types.
--
-- Two independent changes, both additive:
--
-- 1. ADD VALUE, like every AttendeeTag migration before it. Postgres cannot
--    remove an enum value; nothing is renamed or reordered.
-- 2. ADD COLUMN ... NULL, which rewrites nothing and takes no table lock worth
--    the name on postgres 11+. Every existing row reads NULL, which is exactly
--    right: none of them is tagged `other`.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'other';

-- "attendee_orders", not "AttendeeOrder": the model carries @@map, and the
-- table is what SQL sees. The jobTitle migration got this right; this one did
-- not, and only failed because it was rehearsed against the real database.
ALTER TABLE "attendee_orders" ADD COLUMN IF NOT EXISTS "roleLabel" TEXT;
