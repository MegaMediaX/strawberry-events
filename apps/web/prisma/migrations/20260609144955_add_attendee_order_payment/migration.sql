-- CreateEnum
CREATE TYPE "AttendeeOrderProvider" AS ENUM ('free', 'manual_cod');

-- AlterTable
ALTER TABLE "attendee_orders" ADD COLUMN     "provider" "AttendeeOrderProvider" NOT NULL DEFAULT 'manual_cod',
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;
