ALTER TABLE "latitude"."provider_logs" DROP CONSTRAINT "provider_logs_document_log_id_document_logs_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ADD COLUMN "document_log_uuid" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_log_uuid_idx" ON "latitude"."document_logs" USING btree ("document_uuid");--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" DROP COLUMN IF EXISTS "document_log_id";