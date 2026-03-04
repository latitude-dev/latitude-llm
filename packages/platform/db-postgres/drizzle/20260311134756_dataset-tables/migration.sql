CREATE TABLE "latitude"."datasets" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"file_key" text,
	"current_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_unique_name_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","name","deleted_at")
);
--> statement-breakpoint
ALTER TABLE "latitude"."datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."dataset_versions" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"dataset_id" varchar(24) NOT NULL,
	"version" bigint NOT NULL,
	"rows_inserted" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_deleted" integer DEFAULT 0 NOT NULL,
	"source" varchar(64) DEFAULT 'api' NOT NULL,
	"actor_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."dataset_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "datasets_project_id_idx" ON "latitude"."datasets" ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_id_version_idx" ON "latitude"."dataset_versions" ("dataset_id","version");--> statement-breakpoint
CREATE POLICY "datasets_organization_policy" ON "latitude"."datasets" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "dataset_versions_organization_policy" ON "latitude"."dataset_versions" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());