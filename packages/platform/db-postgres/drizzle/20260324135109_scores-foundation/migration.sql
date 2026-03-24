CREATE TABLE "latitude"."scores" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"session_id" varchar(128),
	"trace_id" varchar(32),
	"span_id" varchar(16),
	"source" varchar(32) NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"simulation_id" varchar(24),
	"issue_id" varchar(24),
	"value" double precision NOT NULL,
	"passed" boolean NOT NULL,
	"feedback" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"error" text,
	"errored" boolean NOT NULL,
	"duration" bigint DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "scores_project_list_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_source_bucket_idx" ON "latitude"."scores" ("organization_id","project_id","source","source_id","created_at","id") WHERE "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_issue_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","issue_id","created_at","id") WHERE "issue_id" IS NOT NULL AND "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_trace_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","trace_id","created_at","id") WHERE "trace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_session_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","session_id","created_at","id") WHERE "session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_span_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","span_id","created_at","id") WHERE "span_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_issue_discovery_work_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL AND "errored" = false AND "passed" = false AND "issue_id" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_draft_finalization_idx" ON "latitude"."scores" ("updated_at","id") WHERE "drafted_at" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "scores_organization_policy" ON "latitude"."scores" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());