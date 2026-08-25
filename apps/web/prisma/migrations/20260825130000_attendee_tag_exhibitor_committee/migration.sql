-- Two more badge roles: exhibitors, and the organising committee.
--
-- ADD VALUE only. Postgres enum values cannot be removed, and nothing existing
-- is renamed or reordered, so every one of the 1,169 rows keeps the tag it has
-- and every badge printed so far stays reproducible.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'exhibitor';
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'organising_committee';
