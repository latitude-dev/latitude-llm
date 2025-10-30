ALTER TABLE "latitude"."issues" DROP CONSTRAINT "issues_first_seen_result_id_evaluation_results_v2_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP CONSTRAINT "issues_last_seen_result_id_evaluation_results_v2_id_fk";
--> statement-breakpoint
DROP INDEX "latitude"."issues_first_seen_result_id_idx";--> statement-breakpoint
DROP INDEX "latitude"."issues_last_seen_result_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP COLUMN "first_seen_result_id";--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP COLUMN "last_seen_result_id";