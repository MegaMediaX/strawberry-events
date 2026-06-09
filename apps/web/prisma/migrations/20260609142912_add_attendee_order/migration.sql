-- CreateEnum
CREATE TYPE "AttendeeOrderStatus" AS ENUM ('pending', 'paid', 'canceled');

-- CreateTable
CREATE TABLE "attendee_orders" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "status" "AttendeeOrderStatus" NOT NULL DEFAULT 'pending',
    "magicLinkToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendee_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendee_orders_magicLinkToken_key" ON "attendee_orders"("magicLinkToken");

-- CreateIndex
CREATE INDEX "attendee_orders_eventMappingId_idx" ON "attendee_orders"("eventMappingId");

-- CreateIndex
CREATE INDEX "attendee_orders_userId_idx" ON "attendee_orders"("userId");

-- CreateIndex
CREATE INDEX "attendee_orders_email_idx" ON "attendee_orders"("email");

-- AddForeignKey
ALTER TABLE "attendee_orders" ADD CONSTRAINT "attendee_orders_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendee_orders" ADD CONSTRAINT "attendee_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
