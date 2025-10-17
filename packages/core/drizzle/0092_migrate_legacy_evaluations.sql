--- UNDO MIGRATION
-- Remove current data (this is not a destructive operation, as the data is not currently being used and will be added back in the next steps)
DELETE FROM "latitude"."evaluation_configuration_numerical";
DELETE FROM "latitude"."evaluation_configuration_boolean";
DELETE FROM "latitude"."evaluation_configuration_text";

UPDATE "latitude"."evaluations"
SET
  "result_configuration_id" = NULL,
  "result_type" = NULL;


--- MIGRATION OF "ADVANCED EVALUATIONS" TO THE NEW RESULT CONFIGURATION SCHEMA

-- Add column to configuration tables to help with the migration. Will be removed later on.
ALTER TABLE "latitude"."evaluation_configuration_numerical" ADD COLUMN "metadata_id" bigint;
ALTER TABLE "latitude"."evaluation_configuration_boolean" ADD COLUMN "metadata_id" bigint;
ALTER TABLE "latitude"."evaluation_configuration_text" ADD COLUMN "metadata_id" bigint;

-- Populate configuration tables with data from metadata.configuration, depending on its type
INSERT INTO "latitude"."evaluation_configuration_numerical" ("min_value", "max_value", "metadata_id")
SELECT
  ("configuration"->'detail'->'range'->>'from')::bigint AS "min_value",
  ("configuration"->'detail'->'range'->>'to')::bigint AS "max_value",
  "id" AS "metadata_id"
FROM "latitude"."llm_as_judge_evaluation_metadatas"
WHERE "configuration"->>'type' = 'evaluation_resultable_numbers';

INSERT INTO "latitude"."evaluation_configuration_boolean" ("false_value_description", "metadata_id")
SELECT
  NULL AS "false_value_description",
  "id" AS "metadata_id"
FROM "latitude"."llm_as_judge_evaluation_metadatas"
WHERE "configuration"->>'type' = 'evaluation_resultable_booleans';

INSERT INTO "latitude"."evaluation_configuration_text" ("value_description", "metadata_id")
SELECT
  NULL AS "value_description",
  "id" AS "metadata_id"
FROM "latitude"."llm_as_judge_evaluation_metadatas"
WHERE "configuration"->>'type' = 'evaluation_resultable_texts';

-- Update evaluations table to point to the new configuration tables

UPDATE "latitude"."evaluations"
SET
  "result_configuration_id" = "evaluation_configuration_numerical"."id",
  "result_type" = 'evaluation_resultable_numbers'
FROM "latitude"."evaluation_configuration_numerical"
WHERE "latitude"."evaluations"."metadata_id" = "latitude"."evaluation_configuration_numerical"."metadata_id";

UPDATE "latitude"."evaluations"
SET
  "result_configuration_id" = "evaluation_configuration_boolean"."id",
  "result_type" = 'evaluation_resultable_booleans'
FROM "latitude"."evaluation_configuration_boolean"
WHERE "latitude"."evaluations"."metadata_id" = "latitude"."evaluation_configuration_boolean"."metadata_id";

UPDATE "latitude"."evaluations"
SET
  "result_configuration_id" = "evaluation_configuration_text"."id",
  "result_type" = 'evaluation_resultable_texts'
FROM "latitude"."evaluation_configuration_text"
WHERE "latitude"."evaluations"."metadata_id" = "latitude"."evaluation_configuration_text"."metadata_id";

-- Remove helper columns

ALTER TABLE "latitude"."evaluation_configuration_numerical" DROP COLUMN "metadata_id";
ALTER TABLE "latitude"."evaluation_configuration_boolean" DROP COLUMN "metadata_id";
ALTER TABLE "latitude"."evaluation_configuration_text" DROP COLUMN "metadata_id";
