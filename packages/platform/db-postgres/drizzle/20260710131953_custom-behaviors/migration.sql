CREATE TABLE "latitude"."custom_behaviors" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"filter_set" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_behaviors_unique_slug_per_project_idx" UNIQUE("organization_id","project_id","slug")
);
--> statement-breakpoint
ALTER TABLE "latitude"."custom_behaviors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "custom_behavior_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "custom_behavior_id" varchar(24);--> statement-breakpoint
CREATE INDEX "custom_behaviors_project_idx" ON "latitude"."custom_behaviors" ("organization_id","project_id");--> statement-breakpoint
CREATE POLICY "custom_behaviors_organization_policy" ON "latitude"."custom_behaviors" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());