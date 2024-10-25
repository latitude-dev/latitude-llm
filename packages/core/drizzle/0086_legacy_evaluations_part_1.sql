ALTER TABLE "latitude"."evaluations" ALTER COLUMN "configuration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" ADD COLUMN "configuration" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" DROP COLUMN IF EXISTS "metadata_type";