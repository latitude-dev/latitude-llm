CREATE TABLE "latitude"."calibration_profiles" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"scope" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."calibration_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "taxonomy_categories_organization_policy" ON "latitude"."taxonomy_categories";--> statement-breakpoint
DROP TABLE "latitude"."taxonomy_categories";--> statement-breakpoint
DROP INDEX "latitude"."taxonomy_clusters_parent_category_idx";--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_cluster_lineage" ADD COLUMN "dimension" varchar(32) DEFAULT 'topic' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "dimension" varchar(32) DEFAULT 'topic' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "parent_cluster_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "depth" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "path" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "split_link_threshold" double precision;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "dimension" varchar(32) DEFAULT 'topic' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" DROP COLUMN "parent_category_id";--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" DROP COLUMN "categories_rebuilt";--> statement-breakpoint
DROP INDEX "latitude"."taxonomy_cluster_lineage_project_created_idx";--> statement-breakpoint
CREATE INDEX "taxonomy_cluster_lineage_project_created_idx" ON "latitude"."taxonomy_cluster_lineage" ("organization_id","project_id","dimension","created_at");--> statement-breakpoint
DROP INDEX "latitude"."taxonomy_clusters_project_state_idx";--> statement-breakpoint
CREATE INDEX "taxonomy_clusters_project_state_idx" ON "latitude"."taxonomy_clusters" ("organization_id","project_id","dimension","state","last_observed_at");--> statement-breakpoint
DROP INDEX "latitude"."taxonomy_runs_project_started_idx";--> statement-breakpoint
CREATE INDEX "taxonomy_runs_project_started_idx" ON "latitude"."taxonomy_runs" ("organization_id","project_id","dimension","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calibration_profiles_project_scope_idx" ON "latitude"."calibration_profiles" ("organization_id","project_id","scope");--> statement-breakpoint
CREATE POLICY "calibration_profiles_organization_policy" ON "latitude"."calibration_profiles" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());