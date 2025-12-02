ALTER TYPE "latitude"."log_source" ADD VALUE 'shadow_test' BEFORE 'user';--> statement-breakpoint
ALTER TYPE "latitude"."log_source" ADD VALUE 'ab_test_baseline' BEFORE 'user';--> statement-breakpoint
ALTER TYPE "latitude"."log_source" ADD VALUE 'ab_test_challenger' BEFORE 'user';--> statement-breakpoint
CREATE TABLE "latitude"."deployment_test_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"deployment_test_id" bigint NOT NULL,
	"api_request_id" varchar(256),
	"custom_identifier" varchar(256),
	"routed_to" varchar(20) NOT NULL,
	"baseline_document_log_uuid" uuid,
	"challenger_document_log_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_test_runs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "latitude"."deployment_tests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"baseline_commit_id" bigint NOT NULL,
	"challenger_commit_id" bigint NOT NULL,
	"test_type" varchar(20) NOT NULL,
	"traffic_percentage" integer DEFAULT 50,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"evaluation_uuids" text DEFAULT '{}',
	"use_composite_evaluation" boolean DEFAULT true,
	"name" varchar(256),
	"description" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "deployment_tests_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "latitude"."deployment_test_runs" ADD CONSTRAINT "deployment_test_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_test_runs" ADD CONSTRAINT "deployment_test_runs_deployment_test_id_deployment_tests_id_fk" FOREIGN KEY ("deployment_test_id") REFERENCES "latitude"."deployment_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_baseline_commit_id_commits_id_fk" FOREIGN KEY ("baseline_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_challenger_commit_id_commits_id_fk" FOREIGN KEY ("challenger_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_test_runs_test" ON "latitude"."deployment_test_runs" USING btree ("deployment_test_id");--> statement-breakpoint
CREATE INDEX "idx_test_runs_request" ON "latitude"."deployment_test_runs" USING btree ("api_request_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_workspace" ON "latitude"."deployment_tests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_project" ON "latitude"."deployment_tests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_status" ON "latitude"."deployment_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_document" ON "latitude"."deployment_tests" USING btree ("document_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_active_test_per_document" ON "latitude"."deployment_tests" USING btree ("project_id","document_uuid") WHERE status IN ('pending', 'running', 'paused') AND deleted_at IS NULL;