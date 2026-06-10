-- CreateIndex
CREATE INDEX "attendee_orders_eventMappingId_orderCode_idx" ON "attendee_orders"("eventMappingId", "orderCode");

-- CreateIndex
CREATE INDEX "attendee_orders_eventMappingId_status_idx" ON "attendee_orders"("eventMappingId", "status");

-- CreateIndex
CREATE INDEX "attendee_orders_eventMappingId_approvalStatus_idx" ON "attendee_orders"("eventMappingId", "approvalStatus");

-- CreateIndex
CREATE INDEX "seat_assignments_heldUntil_idx" ON "seat_assignments"("heldUntil");

-- CreateIndex
CREATE INDEX "seat_assignments_attendeeRef_idx" ON "seat_assignments"("attendeeRef");

-- CreateIndex
CREATE INDEX "webhook_deliveries_success_nextRetryAt_idx" ON "webhook_deliveries"("success", "nextRetryAt");
