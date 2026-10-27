CREATE TABLE "latitude"."trace_deletion_requests" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"filters" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"requested_by" jsonb NOT NULL,
	"matched_trace_count" integer DEFAULT 0 NOT NULL,
	"deleted_row_counts" jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."trace_deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "trace_deletion_requests_org_project_created_idx" ON "latitude"."trace_deletion_requests" ("organization_id","project_id","created_at","id");--> statement-breakpoint
CREATE POLICY "trace_deletion_requests_organization_policy" ON "latitude"."trace_deletion_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());