CREATE TABLE "latitude"."import_jobs" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"source" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"config" jsonb NOT NULL,
	"credentials" text,
	"cursor" jsonb,
	"stats" jsonb NOT NULL,
	"runs" jsonb NOT NULL,
	"error" text,
	"cancelled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "import_jobs_org_status_idx" ON "latitude"."import_jobs" ("organization_id","status");--> statement-breakpoint
CREATE INDEX "import_jobs_org_project_created_idx" ON "latitude"."import_jobs" ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_jobs_org_active_uq" ON "latitude"."import_jobs" ("organization_id") WHERE "status" in ('created', 'queued', 'running');--> statement-breakpoint
CREATE POLICY "import_jobs_organization_policy" ON "latitude"."import_jobs" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());