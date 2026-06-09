-- AlterTable
ALTER TABLE "attendee_orders" ADD COLUMN     "roleTag" "AttendeeTag" NOT NULL DEFAULT 'visitor';

-- AlterTable
ALTER TABLE "event_mappings" ADD COLUMN     "itemTagMap" JSONB NOT NULL DEFAULT '{}';
