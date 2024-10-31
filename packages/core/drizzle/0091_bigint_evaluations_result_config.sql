-- Remove all rows for numerical evaluations. This table is not used yet, and will be migrated in the next migration, so we can safely remove any rows that have been added for now.
UPDATE "latitude"."evaluations" SET "result_configuration_id" = NULL WHERE "evaluations"."result_type" = 'evaluation_resultable_numbers';--> statement-breakpoint
UPDATE "latitude"."evaluations" SET "result_type" = NULL WHERE "evaluations"."result_type" = 'evaluation_resultable_numbers';--> statement-breakpoint
DELETE FROM "latitude"."evaluation_configuration_numerical";--> statement-breakpoint

ALTER TABLE "latitude"."evaluation_configuration_numerical" ALTER COLUMN "min_value" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_configuration_numerical" ALTER COLUMN "max_value" SET DATA TYPE bigint;