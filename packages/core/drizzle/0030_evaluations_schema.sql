CREATE TABLE IF NOT EXISTS "latitude"."evaluations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"workspace_id" bigint NOT NULL,
	"template_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."connected_evaluations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_uuid" uuid NOT NULL,
	"evaluation_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connected_evaluations_unique" UNIQUE("document_uuid","evaluation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"evaluation_id" bigint NOT NULL,
	"document_log_id" bigint NOT NULL,
	"provider_log_id" bigint NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluations_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluations" ADD CONSTRAINT "evaluations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluations" ADD CONSTRAINT "evaluations_template_id_evaluations_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "latitude"."evaluations_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."connected_evaluations" ADD CONSTRAINT "connected_evaluations_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "latitude"."evaluations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "latitude"."evaluations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_document_log_id_document_logs_id_fk" FOREIGN KEY ("document_log_id") REFERENCES "latitude"."document_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_provider_log_id_provider_logs_id_fk" FOREIGN KEY ("provider_log_id") REFERENCES "latitude"."provider_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_workspace_idx" ON "latitude"."evaluations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_document_idx" ON "latitude"."connected_evaluations" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_evaluation_idx" ON "latitude"."connected_evaluations" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_idx" ON "latitude"."evaluation_results" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_log_idx" ON "latitude"."evaluation_results" USING btree ("document_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_log_idx" ON "latitude"."evaluation_results" USING btree ("provider_log_id");