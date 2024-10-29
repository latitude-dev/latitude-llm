--- Migrate configuration column from "evaluations" to "llm_as_judge_evaluation_metadatas"
UPDATE "latitude"."llm_as_judge_evaluation_metadatas"
SET "configuration" = "latitude"."evaluations"."configuration"
FROM "latitude"."evaluations"
WHERE "latitude"."evaluations"."metadata_id" = "latitude"."llm_as_judge_evaluation_metadatas"."id";--> statement-breakpoint

--- Remove evaluation metadatas with NULL configuratios (these are llm_as_judge_evaluation_metadatas rows that were left when removing the original evaluation)
DELETE FROM "latitude"."llm_as_judge_evaluation_metadatas" WHERE "latitude"."llm_as_judge_evaluation_metadatas"."configuration" IS NULL--> statement-breakpoint

--- Set configuration column as NOT NULL
ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" ALTER COLUMN "configuration" SET NOT NULL;