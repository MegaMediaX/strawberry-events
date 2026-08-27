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

ALTER TABLE "AttendeeOrder" ADD COLUMN IF NOT EXISTS "roleLabel" TEXT;
