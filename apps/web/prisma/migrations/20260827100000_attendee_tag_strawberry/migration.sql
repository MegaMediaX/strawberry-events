-- The agency running the event gets its own badge, distinct from the client's
-- staff and organisers.
--
-- ADD VALUE only, like every AttendeeTag migration before it. Postgres cannot
-- remove an enum value and nothing here is renamed or reordered, so every
-- existing row keeps the tag it has.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'strawberry';
