-- This is already done in production so not sure what's happening here?
--
-- ALTER TYPE "latitude"."log_source" ADD VALUE 'shadow_test';--> statement-breakpoint
-- ALTER TYPE "latitude"."log_source" ADD VALUE 'ab_test_challenger';--> statement-breakpoint
DROP INDEX "latitude"."evaluation_results_v2_unique_evaluated_log_id_evaluation_uuid_idx";--> statement-breakpoint
DROP INDEX "latitude"."evaluation_results_v2_unique_evaluated_span_id_evaluation_uuid_idx";
