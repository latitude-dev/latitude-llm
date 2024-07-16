ALTER TABLE "latitude"."commits" ADD COLUMN "merged_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."commits" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "latitude"."commits" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP COLUMN IF EXISTS "merged_at";