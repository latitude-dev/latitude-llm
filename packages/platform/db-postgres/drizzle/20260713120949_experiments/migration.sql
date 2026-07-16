CREATE TABLE "latitude"."experiments" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"variants" jsonb DEFAULT '[]' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."experiments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_project_slug_uq" ON "latitude"."experiments" ("project_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "experiments_org_project_active_idx" ON "latitude"."experiments" ("organization_id","project_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE POLICY "experiments_organization_policy" ON "latitude"."experiments" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());