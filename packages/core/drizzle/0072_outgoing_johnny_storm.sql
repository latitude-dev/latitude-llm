DROP INDEX IF EXISTS "run_errors_errorable_entity_idx";--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" DROP COLUMN IF EXISTS "errorable_id";