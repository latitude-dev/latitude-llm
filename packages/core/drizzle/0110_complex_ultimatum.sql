ALTER TABLE "latitude"."spans" ADD COLUMN "document_uuid" uuid;--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP COLUMN IF EXISTS "prompt_path";