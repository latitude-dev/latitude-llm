CREATE TABLE "latitude"."issues" (
	"id" varchar(24) PRIMARY KEY,
	"uuid" uuid NOT NULL UNIQUE,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"centroid" jsonb NOT NULL,
	"clustered_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"ignored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "issues_project_lifecycle_idx" ON "latitude"."issues" ("organization_id","project_id","ignored_at","resolved_at","created_at");--> statement-breakpoint
CREATE POLICY "issues_organization_policy" ON "latitude"."issues" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());