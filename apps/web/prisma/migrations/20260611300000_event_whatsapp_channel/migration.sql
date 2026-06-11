-- AlterTable: add optional WhatsApp channel link to event_mappings
ALTER TABLE "event_mappings" ADD COLUMN "whatsappChannelUrl" TEXT;
