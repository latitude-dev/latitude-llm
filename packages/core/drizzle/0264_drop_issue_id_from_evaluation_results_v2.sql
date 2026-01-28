ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT "evaluation_results_v2_issue_id_issues_id_fk";
--> statement-breakpoint
DROP INDEX "latitude"."evaluation_results_v2_issue_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP COLUMN "issue_id";