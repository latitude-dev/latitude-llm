ALTER TYPE "latitude"."log_source" ADD VALUE 'scheduled_trigger';--> statement-breakpoint
ALTER TYPE "latitude"."document_trigger_types" ADD VALUE 'scheduled';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_trigger_next_run_time_idx" ON "latitude"."document_triggers" USING btree ((configuration->>'nextRunTime'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_trigger_type_idx" ON "latitude"."document_triggers" USING btree ("trigger_type");