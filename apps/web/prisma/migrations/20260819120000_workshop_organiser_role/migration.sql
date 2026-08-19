-- Workshop organiser: a member scoped to specific SESSIONS, not a whole event.
--
-- Every existing role is organization-wide, with one narrowing (checkin_staff's
-- assignedEventIds). A speaker or partner running one workshop needs their own
-- attendee list and nothing else — not the other 800 registrations, not finance,
-- not users.
--
-- Two columns rather than one: assignedEventIds still scopes which EVENT they
-- can reach (so the synchronous event-scope helper keeps working unchanged), and
-- assignedSubEventIds narrows within it. A row with a session but no event is
-- inert by construction, which is the safe direction.
-- IF NOT EXISTS so applying this ahead of the deploy (to avoid the window where
-- new code queries a column the schema does not have yet) stays safe if the
-- pipeline runs it again.
ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'workshop_organiser';

-- Sessions this member may see. Empty for every other role, so the column is a
-- no-op for existing rows and needs no backfill.
ALTER TABLE "organization_members"
  ADD COLUMN IF NOT EXISTS "assignedSubEventIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
