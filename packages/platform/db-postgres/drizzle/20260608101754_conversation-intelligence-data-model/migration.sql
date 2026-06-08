DROP POLICY "taxonomy_categories_organization_policy" ON "latitude"."taxonomy_categories";--> statement-breakpoint
DROP TABLE "latitude"."taxonomy_categories";--> statement-breakpoint
DROP INDEX "latitude"."taxonomy_clusters_parent_category_idx";--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "parent_cluster_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "depth" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "path" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" ADD COLUMN "split_link_threshold" double precision;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_clusters" DROP COLUMN "parent_category_id";--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" DROP COLUMN "categories_rebuilt";