DROP INDEX IF EXISTS "document_log_uuid_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_log_document_uuid_idx" ON "latitude"."document_logs" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_log_uuid_idx" ON "latitude"."document_logs" USING btree ("uuid");