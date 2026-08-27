-- Three delegate categories LEBTECH badges separately: investors, startups,
-- and government delegations.
--
-- ADD VALUE only, like every AttendeeTag migration before it. Postgres cannot
-- remove an enum value and nothing here is renamed or reordered, so every
-- existing row keeps the tag it has. Three statements in one transaction is
-- what the organiser/cofounder migration already did; none of the new values
-- is USED here, which is the only thing postgres forbids in the same
-- transaction that creates it.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'investor';
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'startup';
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'government';
