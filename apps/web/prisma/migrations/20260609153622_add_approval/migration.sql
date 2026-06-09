-- CreateEnum
CREATE TYPE "AttendeeApprovalStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "attendee_orders" ADD COLUMN     "approvalStatus" "AttendeeApprovalStatus" NOT NULL DEFAULT 'not_required';

-- AlterTable
ALTER TABLE "event_mappings" ADD COLUMN     "autoApproveItemIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "payBeforeApproval" BOOLEAN NOT NULL DEFAULT false;
