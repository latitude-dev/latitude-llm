ALTER TABLE "latitude"."evaluation_versions" ADD COLUMN "ignored_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD COLUMN "merged_to_issue_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_merged_to_issue_id_issues_id_fk" FOREIGN KEY ("merged_to_issue_id") REFERENCES "latitude"."issues"("id") ON DELETE set null ON UPDATE no action;