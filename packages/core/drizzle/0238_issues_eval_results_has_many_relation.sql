CREATE TABLE "latitude"."issue_evaluation_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"evaluation_result_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."issue_evaluation_results" ADD CONSTRAINT "issue_evaluation_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issue_evaluation_results" ADD CONSTRAINT "issue_evaluation_results_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "latitude"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_evaluation_results_workspace_id_idx" ON "latitude"."issue_evaluation_results" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "issue_evaluation_results_issue_id_idx" ON "latitude"."issue_evaluation_results" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_evaluation_results_evaluation_result_id_idx" ON "latitude"."issue_evaluation_results" USING btree ("evaluation_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_evaluation_results_unique_issue_eval_idx" ON "latitude"."issue_evaluation_results" USING btree ("issue_id","evaluation_result_id");

-- Backfill existing issue_id from evaluation_results_v2 into the new join table
INSERT INTO "latitude"."issue_evaluation_results" ("workspace_id", "issue_id", "evaluation_result_id", "created_at", "updated_at")
SELECT
	er.workspace_id,
	er.issue_id,
	er.id as evaluation_result_id,
	er.created_at,
	er.updated_at
FROM "latitude"."evaluation_results_v2" er
WHERE er.issue_id IS NOT NULL
ON CONFLICT ("issue_id", "evaluation_result_id") DO NOTHING;
