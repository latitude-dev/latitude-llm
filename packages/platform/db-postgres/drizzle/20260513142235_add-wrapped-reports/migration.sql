CREATE TABLE "latitude"."wrapped_reports" (
	"id" varchar(24) PRIMARY KEY,
	"type" varchar(32) DEFAULT 'claude_code' NOT NULL,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"owner_name" varchar(256) NOT NULL,
	"report_version" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."wrapped_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "wrapped_reports_organization_id_idx" ON "latitude"."wrapped_reports" ("organization_id");--> statement-breakpoint
CREATE INDEX "wrapped_reports_type_project_recent_idx" ON "latitude"."wrapped_reports" ("type","project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "wrapped_reports_organization_policy" ON "latitude"."wrapped_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
