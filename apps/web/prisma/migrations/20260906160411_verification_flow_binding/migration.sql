-- Pure expand: one nullable column. Nothing existing is altered.
--
-- The THIRD generated migration in a row to arrive carrying DROP INDEX for the
-- trigram search indexes, removed by hand again. src/lib/db/__tests__/
-- migrations.test.ts fails the build if they ever survive, which is why this is
-- a footnote rather than an incident.
--
-- Nullable on purpose: codes issued before this column existed have no flow
-- bound to them, and must keep working for anyone mid-verification when this
-- deploys.

-- AlterTable
ALTER TABLE "email_verification_codes" ADD COLUMN     "flowHash" TEXT;

