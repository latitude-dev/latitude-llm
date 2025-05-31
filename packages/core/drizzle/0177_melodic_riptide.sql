ALTER TABLE "latitude"."segments" RENAME COLUMN "prompt_hash" TO "document_hash";--> statement-breakpoint
DROP INDEX IF EXISTS "segments_prompt_hash_idx";--> statement-breakpoint
ALTER TABLE "latitude"."segments" ALTER COLUMN "document_type" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD COLUMN "document_run_uuid" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_document_run_uuid_idx" ON "latitude"."segments" USING btree ("document_run_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_document_hash_idx" ON "latitude"."segments" USING btree ("document_hash");--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_document_run_uuid_unique" UNIQUE("document_run_uuid");