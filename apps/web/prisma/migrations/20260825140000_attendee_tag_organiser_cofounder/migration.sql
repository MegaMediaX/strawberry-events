-- Two more badge roles: organisers, and co-founders.
--
-- ADD VALUE only, like the migration before it. Postgres cannot remove enum
-- values and nothing here is renamed or reordered, so every existing row keeps
-- the tag it has.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'organiser';
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'cofounder';
