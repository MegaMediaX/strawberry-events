-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('super_admin', 'organizer_admin', 'checkin_staff', 'finance');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'private', 'hidden');

-- CreateEnum
CREATE TYPE "AccountMode" AS ENUM ('required', 'optional', 'guest');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('none', 'manual', 'automatic', 'manual_and_automatic');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('approve', 'require_manual', 'decline');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "AttendeeTag" AS ENUM ('media', 'partner', 'staff', 'speaker', 'visitor');

-- CreateEnum
CREATE TYPE "SeatState" AS ENUM ('available', 'temporarily_held', 'sold_or_reserved', 'blocked', 'accessible');

-- CreateEnum
CREATE TYPE "SmtpEncryption" AS ENUM ('none', 'tls', 'ssl');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pretixOrganizerSlug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "assignedEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "phoneCC" TEXT,
    "company" TEXT,
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "localEventId" TEXT NOT NULL,
    "pretixOrganizerSlug" TEXT NOT NULL,
    "pretixEventSlug" TEXT NOT NULL,
    "pretixEventId" TEXT,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "accountMode" "AccountMode" NOT NULL DEFAULT 'optional',
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'none',
    "badgeAutoPrint" BOOLEAN NOT NULL DEFAULT false,
    "comingSoon" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pretix_object_mappings" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "pretixId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pretix_object_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_maps" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_sections" (
    "id" TEXT NOT NULL,
    "seatMapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_rows" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" "SeatState" NOT NULL DEFAULT 'available',
    "heldUntil" TIMESTAMP(3),
    "pretixOrderId" TEXT,
    "attendeeRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_templates" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "tag" "AttendeeTag" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "config" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_print_logs" (
    "id" TEXT NOT NULL,
    "badgeTemplateId" TEXT,
    "eventMappingId" TEXT NOT NULL,
    "attendeeRef" TEXT NOT NULL,
    "pretixOrderId" TEXT,
    "printedByUserId" TEXT,
    "reprint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_print_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "ticketId" TEXT,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "pretixOrderId" TEXT,
    "attendeeRef" TEXT NOT NULL,
    "ticketId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "internalNotes" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_form_fields" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventMappingId" TEXT,
    "ticketId" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "helpTextEn" TEXT,
    "helpTextAr" TEXT,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_form_answers" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "pretixOrderId" TEXT,
    "attendeeRef" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_form_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "username" TEXT,
    "passwordEnc" TEXT,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "encryption" "SmtpEncryption" NOT NULL DEFAULT 'tls',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eventRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
    "createdByUserId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventMappingId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_queue" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "archive_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_pretixOrganizerSlug_key" ON "organizations"("pretixOrganizerSlug");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_mappings_localEventId_key" ON "event_mappings"("localEventId");

-- CreateIndex
CREATE INDEX "event_mappings_organizationId_idx" ON "event_mappings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "event_mappings_pretixOrganizerSlug_pretixEventSlug_key" ON "event_mappings"("pretixOrganizerSlug", "pretixEventSlug");

-- CreateIndex
CREATE INDEX "pretix_object_mappings_eventMappingId_objectType_idx" ON "pretix_object_mappings"("eventMappingId", "objectType");

-- CreateIndex
CREATE INDEX "seat_maps_eventMappingId_idx" ON "seat_maps"("eventMappingId");

-- CreateIndex
CREATE INDEX "seat_sections_seatMapId_idx" ON "seat_sections"("seatMapId");

-- CreateIndex
CREATE INDEX "seat_rows_sectionId_idx" ON "seat_rows"("sectionId");

-- CreateIndex
CREATE INDEX "seat_assignments_state_idx" ON "seat_assignments"("state");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_rowId_label_key" ON "seat_assignments"("rowId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "badge_templates_eventMappingId_tag_key" ON "badge_templates"("eventMappingId", "tag");

-- CreateIndex
CREATE INDEX "badge_print_logs_eventMappingId_idx" ON "badge_print_logs"("eventMappingId");

-- CreateIndex
CREATE INDEX "approval_rules_eventMappingId_idx" ON "approval_rules"("eventMappingId");

-- CreateIndex
CREATE INDEX "approval_requests_eventMappingId_status_idx" ON "approval_requests"("eventMappingId", "status");

-- CreateIndex
CREATE INDEX "custom_form_fields_organizationId_idx" ON "custom_form_fields"("organizationId");

-- CreateIndex
CREATE INDEX "custom_form_fields_eventMappingId_idx" ON "custom_form_fields"("eventMappingId");

-- CreateIndex
CREATE INDEX "custom_form_answers_fieldId_idx" ON "custom_form_answers"("fieldId");

-- CreateIndex
CREATE INDEX "custom_form_answers_attendeeRef_idx" ON "custom_form_answers"("attendeeRef");

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_organizationId_provider_key" ON "integration_settings"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "smtp_settings_organizationId_key" ON "smtp_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_idx" ON "webhooks"("organizationId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "archive_queue_purgeAfter_idx" ON "archive_queue"("purgeAfter");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_mappings" ADD CONSTRAINT "event_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pretix_object_mappings" ADD CONSTRAINT "pretix_object_mappings_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_maps" ADD CONSTRAINT "seat_maps_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_sections" ADD CONSTRAINT "seat_sections_seatMapId_fkey" FOREIGN KEY ("seatMapId") REFERENCES "seat_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_rows" ADD CONSTRAINT "seat_rows_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "seat_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "seat_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_templates" ADD CONSTRAINT "badge_templates_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_print_logs" ADD CONSTRAINT "badge_print_logs_badgeTemplateId_fkey" FOREIGN KEY ("badgeTemplateId") REFERENCES "badge_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_fields" ADD CONSTRAINT "custom_form_fields_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_fields" ADD CONSTRAINT "custom_form_fields_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_answers" ADD CONSTRAINT "custom_form_answers_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "custom_form_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_settings" ADD CONSTRAINT "smtp_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
