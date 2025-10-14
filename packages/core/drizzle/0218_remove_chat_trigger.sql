-- Remove chat trigger type
ALTER TABLE "latitude"."document_trigger_events" ALTER COLUMN "trigger_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ALTER COLUMN "trigger_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "latitude"."document_trigger_types";--> statement-breakpoint

-- Delete all chat triggers
DELETE FROM "latitude"."document_trigger_events" WHERE "trigger_type" = 'chat';--> statement-breakpoint
DELETE FROM "latitude"."document_triggers" WHERE "trigger_type" = 'chat';--> statement-breakpoint

-- Create new trigger types
CREATE TYPE "latitude"."document_trigger_types" AS ENUM('email', 'scheduled', 'integration');--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" ALTER COLUMN "trigger_type" SET DATA TYPE "latitude"."document_trigger_types" USING "trigger_type"::"latitude"."document_trigger_types";--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ALTER COLUMN "trigger_type" SET DATA TYPE "latitude"."document_trigger_types" USING "trigger_type"::"latitude"."document_trigger_types";