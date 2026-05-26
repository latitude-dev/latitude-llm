CREATE TABLE "latitude"."taxonomy_categories" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(280) NOT NULL,
	"centroid_embedding" vector(2048),
	"search_document" tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED NOT NULL,
	"cluster_count" integer DEFAULT 0 NOT NULL,
	"observation_count" bigint DEFAULT 0 NOT NULL,
	"state" varchar(16) DEFAULT 'active' NOT NULL,
	"clustered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."taxonomy_cluster_lineage" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"run_id" varchar(24) NOT NULL,
	"transition_type" varchar(16) NOT NULL,
	"from_cluster_ids" varchar(24)[] DEFAULT '{}'::varchar(24)[] NOT NULL,
	"to_cluster_ids" varchar(24)[] DEFAULT '{}'::varchar(24)[] NOT NULL,
	"similarity" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_cluster_lineage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."taxonomy_clusters" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"parent_category_id" varchar(24),
	"name" varchar(80) NOT NULL,
	"description" varchar(280) NOT NULL,
	"centroid" jsonb NOT NULL,
	"centroid_embedding" vector(2048),
	"search_document" tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED NOT NULL,
	"observation_count" bigint DEFAULT 0 NOT NULL,
	"state" varchar(16) DEFAULT 'active' NOT NULL,
	"merged_into_cluster_id" varchar(24),
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"clustered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."taxonomy_runs" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"trigger" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"observations_scanned" integer DEFAULT 0 NOT NULL,
	"noise_scanned" integer DEFAULT 0 NOT NULL,
	"clusters_born" integer DEFAULT 0 NOT NULL,
	"clusters_merged" integer DEFAULT 0 NOT NULL,
	"clusters_deprecated" integer DEFAULT 0 NOT NULL,
	"categories_rebuilt" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "taxonomy_categories_project_state_idx" ON "latitude"."taxonomy_categories" ("organization_id","project_id","state");--> statement-breakpoint
CREATE INDEX "taxonomy_categories_search_document_idx" ON "latitude"."taxonomy_categories" USING gin ("search_document");--> statement-breakpoint
CREATE INDEX "taxonomy_cluster_lineage_project_created_idx" ON "latitude"."taxonomy_cluster_lineage" ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "taxonomy_clusters_project_state_idx" ON "latitude"."taxonomy_clusters" ("organization_id","project_id","state","last_observed_at");--> statement-breakpoint
CREATE INDEX "taxonomy_clusters_parent_category_idx" ON "latitude"."taxonomy_clusters" ("organization_id","project_id","parent_category_id");--> statement-breakpoint
CREATE INDEX "taxonomy_clusters_search_document_idx" ON "latitude"."taxonomy_clusters" USING gin ("search_document");--> statement-breakpoint
CREATE INDEX "taxonomy_runs_project_started_idx" ON "latitude"."taxonomy_runs" ("organization_id","project_id","started_at");--> statement-breakpoint
CREATE POLICY "taxonomy_categories_organization_policy" ON "latitude"."taxonomy_categories" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "taxonomy_cluster_lineage_organization_policy" ON "latitude"."taxonomy_cluster_lineage" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "taxonomy_clusters_organization_policy" ON "latitude"."taxonomy_clusters" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "taxonomy_runs_organization_policy" ON "latitude"."taxonomy_runs" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());