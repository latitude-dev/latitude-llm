-- Remove commit_id from document_trigger_events
ALTER TABLE "latitude"."document_trigger_events" DROP CONSTRAINT "document_trigger_events_commit_id_commits_id_fk";--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" DROP COLUMN "commit_id";--> statement-breakpoint

-- Add trigger_hash to document_triggers
ALTER TABLE "latitude"."document_triggers" ADD COLUMN "trigger_hash" text;--> statement-breakpoint
UPDATE "latitude"."document_triggers" SET "trigger_hash" = '';--> statement-breakpoint
ALTER TABLE "latitude"."document_triggers" ALTER COLUMN "trigger_hash" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "document_trigger_hash_idx" ON "latitude"."document_triggers" USING btree ("trigger_hash");--> statement-breakpoint

-- Add trigger_hash to document_trigger_events
ALTER TABLE "latitude"."document_trigger_events" ADD COLUMN "trigger_hash" text;--> statement-breakpoint
UPDATE "latitude"."document_trigger_events" SET "trigger_hash" = '';--> statement-breakpoint
ALTER TABLE "latitude"."document_trigger_events" ALTER COLUMN "trigger_hash" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "document_trigger_events_trigger_hash_idx" ON "latitude"."document_trigger_events" USING btree ("trigger_hash");--> statement-breakpoint
