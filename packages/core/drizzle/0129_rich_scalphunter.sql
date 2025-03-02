CREATE TABLE IF NOT EXISTS "latitude"."evaluations_v2" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"type" varchar(128) NOT NULL,
	"metric" varchar(128) NOT NULL,
	"condition" varchar(128) NOT NULL,
	"threshold" bigint NOT NULL,
	"configuration" jsonb NOT NULL,
	"live" boolean,
	"enable_suggestions" boolean,
	"auto_apply_suggestions" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_results_v2" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"evaluation_id" bigint NOT NULL,
	"experiment_id" bigint,
	"evaluated_log_id" bigint NOT NULL,
	"score" bigint NOT NULL,
	"metadata" jsonb NOT NULL,
	"used_for_suggestion" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluations_v2" ADD CONSTRAINT "evaluations_v2_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluations_v2" ADD CONSTRAINT "evaluations_v2_document_versions_fk" FOREIGN KEY ("commit_id","document_uuid") REFERENCES "latitude"."document_versions"("commit_id","document_uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_evaluation_id_evaluations_v2_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "latitude"."evaluations_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_evaluated_log_id_provider_logs_id_fk" FOREIGN KEY ("evaluated_log_id") REFERENCES "latitude"."provider_logs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_v2_workspace_id_idx" ON "latitude"."evaluations_v2" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_v2_commit_id_idx" ON "latitude"."evaluations_v2" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_v2_document_uuid_idx" ON "latitude"."evaluations_v2" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_workspace_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_evaluation_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_experiment_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_evaluated_log_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluated_log_id");