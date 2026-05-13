CREATE TABLE "latitude"."claude_code_wrapped_reports" (
	"id" varchar(24) PRIMARY KEY,
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
ALTER TABLE "latitude"."claude_code_wrapped_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ccw_reports_organization_id_idx" ON "latitude"."claude_code_wrapped_reports" ("organization_id");--> statement-breakpoint
CREATE INDEX "ccw_reports_project_window_idx" ON "latitude"."claude_code_wrapped_reports" ("project_id","window_start" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "claude_code_wrapped_reports_organization_policy" ON "latitude"."claude_code_wrapped_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
