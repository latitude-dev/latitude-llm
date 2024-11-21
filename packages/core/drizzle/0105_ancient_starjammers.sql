DROP INDEX IF EXISTS "spans_metadata_idx";--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP COLUMN IF EXISTS "metadata_type";--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP COLUMN IF EXISTS "metadata_id";