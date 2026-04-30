CREATE TABLE "latitude"."saved_searches" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(256) NOT NULL,
	"query" text,
	"filter_set" jsonb NOT NULL,
	"assigned_user_id" varchar(24),
	"created_by_user_id" varchar(24) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_unique_slug_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","slug","deleted_at")
);
--> statement-breakpoint
ALTER TABLE "latitude"."saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "saved_searches_organization_id_idx" ON "latitude"."saved_searches" ("organization_id");--> statement-breakpoint
CREATE INDEX "saved_searches_project_id_idx" ON "latitude"."saved_searches" ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE INDEX "saved_searches_assigned_user_id_idx" ON "latitude"."saved_searches" ("organization_id","assigned_user_id","deleted_at");--> statement-breakpoint
CREATE POLICY "saved_searches_organization_policy" ON "latitude"."saved_searches" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());