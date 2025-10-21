CREATE TABLE "latitude"."issue_histograms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"date" date NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "issue_histograms_unique_workspace_issue_date" UNIQUE("issue_id","date")
);
--> statement-breakpoint
CREATE TABLE "latitude"."issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"first_seen_result_id" bigint,
	"first_seen_at" timestamp NOT NULL,
	"last_seen_result_id" bigint,
	"last_seen_at" timestamp NOT NULL,
	"resolved_at" timestamp,
	"ignored_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "issue_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" ADD COLUMN "issue_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD CONSTRAINT "issue_histograms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD CONSTRAINT "issue_histograms_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "latitude"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_first_seen_result_id_evaluation_results_v2_id_fk" FOREIGN KEY ("first_seen_result_id") REFERENCES "latitude"."evaluation_results_v2"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."issues" ADD CONSTRAINT "issues_last_seen_result_id_evaluation_results_v2_id_fk" FOREIGN KEY ("last_seen_result_id") REFERENCES "latitude"."evaluation_results_v2"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_histograms_workspace_id_idx" ON "latitude"."issue_histograms" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "issue_histograms_issue_id_idx" ON "latitude"."issue_histograms" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_histograms_date_idx" ON "latitude"."issue_histograms" USING btree ("date");--> statement-breakpoint
CREATE INDEX "issue_histograms_date_brin_idx" ON "latitude"."issue_histograms" USING brin ("date") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint
CREATE INDEX "issues_workspace_id_idx" ON "latitude"."issues" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "issues_project_id_idx" ON "latitude"."issues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issues_commit_id_idx" ON "latitude"."issues" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX "issues_document_uuid_idx" ON "latitude"."issues" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX "issues_title_trgm_idx" ON "latitude"."issues" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "issues_first_seen_result_id_idx" ON "latitude"."issues" USING btree ("first_seen_result_id");--> statement-breakpoint
CREATE INDEX "issues_first_seen_at_idx" ON "latitude"."issues" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "issues_last_seen_result_id_idx" ON "latitude"."issues" USING btree ("last_seen_result_id");--> statement-breakpoint
CREATE INDEX "issues_last_seen_at_idx" ON "latitude"."issues" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "issues_resolved_at_idx" ON "latitude"."issues" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "issues_ignored_at_idx" ON "latitude"."issues" USING btree ("ignored_at");--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "latitude"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" ADD CONSTRAINT "evaluation_versions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "latitude"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_issue_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "evaluation_v2_issue_id_idx" ON "latitude"."evaluation_versions" USING btree ("issue_id");