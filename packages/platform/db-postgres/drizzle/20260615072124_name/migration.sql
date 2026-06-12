CREATE TABLE "latitude"."destination_sync_runs" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"destination_id" varchar(24) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" varchar(16) NOT NULL,
	"spans_read" integer NOT NULL,
	"events_sent" integer NOT NULL,
	"events_dropped" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."destination_sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."destinations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"credentials" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_failure_message" text,
	"cursor_ingested_at" timestamp with time zone NOT NULL,
	"cursor_span_id" varchar(16) DEFAULT '' NOT NULL,
	"last_run_at" timestamp with time zone,
	"consecutive_empty_runs" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."destinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "destination_sync_runs_destination_id_started_at_idx" ON "latitude"."destination_sync_runs" ("destination_id","started_at");--> statement-breakpoint
CREATE INDEX "destination_sync_runs_finished_at_brin_idx" ON "latitude"."destination_sync_runs" USING brin ("finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_project_id_kind_idx" ON "latitude"."destinations" ("project_id","kind");--> statement-breakpoint
CREATE INDEX "destinations_organization_id_idx" ON "latitude"."destinations" ("organization_id");--> statement-breakpoint
CREATE INDEX "destinations_status_last_run_at_idx" ON "latitude"."destinations" ("status","last_run_at");--> statement-breakpoint
CREATE POLICY "destination_sync_runs_organization_policy" ON "latitude"."destination_sync_runs" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "destinations_organization_policy" ON "latitude"."destinations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());