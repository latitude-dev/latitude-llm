ALTER TABLE "latitude"."document_versions" ADD COLUMN "resolved_content" text;--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP COLUMN IF EXISTS "hash";