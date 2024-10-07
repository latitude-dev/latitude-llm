ALTER TABLE "latitude"."document_versions" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ADD COLUMN "content_hash" text;--> statement-breakpoint

UPDATE "latitude"."document_versions"
SET "content_hash" = md5("resolved_content")
WHERE "resolved_content" IS NOT NULL;--> statement-breakpoint

UPDATE "latitude"."document_logs"
SET "content_hash" = md5("resolved_content");--> statement-breakpoint

ALTER TABLE "latitude"."document_logs"
ALTER COLUMN "content_hash" SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_logs_content_hash_idx" ON "latitude"."document_logs" USING btree ("content_hash");