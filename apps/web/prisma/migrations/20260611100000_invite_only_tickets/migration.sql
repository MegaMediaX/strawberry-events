-- AlterTable: add invite-only item ids to event_mappings
ALTER TABLE "event_mappings" ADD COLUMN "inviteOnlyItemIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
