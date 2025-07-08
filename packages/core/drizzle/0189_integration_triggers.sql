ALTER TYPE "latitude"."log_source" ADD VALUE 'integration_trigger';--> statement-breakpoint
ALTER TYPE "latitude"."document_trigger_types" ADD VALUE 'integration';--> statement-breakpoint
ALTER TABLE "latitude"."integrations" ADD COLUMN "has_tools" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."integrations" ADD COLUMN "has_triggers" boolean DEFAULT false NOT NULL;