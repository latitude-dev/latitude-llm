ALTER TABLE "latitude"."connected_evaluations" DROP CONSTRAINT "connected_evaluations_unique_idx";--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" DROP COLUMN IF EXISTS "commit_uuid";--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" ADD CONSTRAINT "connected_evaluations_unique_idx" UNIQUE("document_uuid","evaluation_id");