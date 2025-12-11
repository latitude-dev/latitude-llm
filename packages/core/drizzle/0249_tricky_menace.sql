ALTER TYPE "latitude"."log_source" ADD VALUE 'shadow_test' BEFORE 'user';--> statement-breakpoint
ALTER TYPE "latitude"."log_source" ADD VALUE 'ab_test_challenger' BEFORE 'user';--> statement-breakpoint
CREATE TABLE "latitude"."deployment_tests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"challenger_commit_id" bigint NOT NULL,
	"test_type" varchar(20) NOT NULL,
	"traffic_percentage" integer DEFAULT 50,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_by_user_id" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_tests_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "test_deployment_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_challenger_commit_id_commits_id_fk" FOREIGN KEY ("challenger_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."deployment_tests" ADD CONSTRAINT "deployment_tests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_workspace" ON "latitude"."deployment_tests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_project" ON "latitude"."deployment_tests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_status" ON "latitude"."deployment_tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_project_type_status" ON "latitude"."deployment_tests" USING btree ("project_id","test_type","status");--> statement-breakpoint
CREATE INDEX "spans_test_deployment_id_idx" ON "latitude"."spans" USING btree ("test_deployment_id");