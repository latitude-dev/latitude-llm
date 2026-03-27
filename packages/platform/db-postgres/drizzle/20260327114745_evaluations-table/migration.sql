CREATE TABLE "latitude"."evaluations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"issue_id" varchar(24) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"script" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"alignment" jsonb NOT NULL,
	"aligned_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_unique_name_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","name","deleted_at")
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "evaluations_project_lifecycle_idx" ON "latitude"."evaluations" ("organization_id","project_id","deleted_at","archived_at","created_at");--> statement-breakpoint
CREATE INDEX "evaluations_issue_lookup_idx" ON "latitude"."evaluations" ("organization_id","project_id","issue_id","deleted_at");--> statement-breakpoint
CREATE POLICY "evaluations_organization_policy" ON "latitude"."evaluations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());