CREATE TABLE "latitude"."taxonomy_facets" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(300) NOT NULL,
	"instructions" varchar(4000) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"last_gardened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_facets_unique_slug_per_project_idx" UNIQUE("organization_id","project_id","slug")
);
--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_facets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "facet_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "facet_id" varchar(24);--> statement-breakpoint
CREATE INDEX "taxonomy_facets_project_idx" ON "latitude"."taxonomy_facets" ("organization_id","project_id");--> statement-breakpoint
CREATE POLICY "taxonomy_facets_organization_policy" ON "latitude"."taxonomy_facets" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());