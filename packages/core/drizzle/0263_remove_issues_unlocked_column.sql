DROP TABLE "latitude"."document_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP COLUMN "used_for_suggestion";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN "enable_suggestions";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN "auto_apply_suggestions";--> statement-breakpoint
ALTER TABLE "latitude"."workspaces" DROP COLUMN "issues_unlocked";