ALTER TABLE "latitude"."connected_evaluations" DROP CONSTRAINT "connected_evaluations_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "connected_document_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "connected_evaluation_idx";--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" ADD COLUMN "commit_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" ADD COLUMN "evaluation_mode" "latitude"."evaluation_mode_enum" NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_evaluations_evaluation_idx" ON "latitude"."connected_evaluations" USING btree ("evaluation_id");--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" ADD CONSTRAINT "connected_evaluations_unique_idx" UNIQUE("document_uuid","commit_uuid","evaluation_id");