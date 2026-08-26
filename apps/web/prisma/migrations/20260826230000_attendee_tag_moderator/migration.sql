-- Panel moderators get their own badge role.
--
-- ADD VALUE only, like the two migrations before it. Postgres cannot remove an
-- enum value and nothing here is renamed or reordered, so every existing row
-- keeps the tag it has. Appended to the end of the type, which is where
-- ALTER TYPE ... ADD VALUE puts it; the order roles are OFFERED in is
-- BADGE_TAGS' business, and moderator sits next to speaker there.
ALTER TYPE "AttendeeTag" ADD VALUE IF NOT EXISTS 'moderator';
