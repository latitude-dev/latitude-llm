import {
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  type TaxonomyCentroid,
  type TaxonomyClusterState,
} from "@domain/taxonomy"
import { sql } from "drizzle-orm"
import { bigint, customType, index, jsonb, varchar, vector } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
})

/**
 * Canonical leaf-cluster row. Mirrors the issues shape: JSONB centroid +
 * derived `vector(2048)` materialized inside the repository `save`, plus
 * a GIN-indexed `tsvector` for hybrid search.
 *
 * No HNSW/IVFFlat on `centroid_embedding`: per-project cluster count is
 * expected in the hundreds to low thousands; exact sequential scan under
 * `(organization_id, project_id)` outperforms approximate indexes at that
 * scale. Same rule as `@domain/issues`.
 */
export const taxonomyClusters = latitudeSchema.table(
  "taxonomy_clusters",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    parentCategoryId: cuid("parent_category_id", { default: false }),
    name: varchar("name", { length: TAXONOMY_CLUSTER_NAME_MAX_LENGTH }).notNull(),
    description: varchar("description", { length: TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH }).notNull(),
    centroid: jsonb("centroid").$type<TaxonomyCentroid>().notNull(),
    centroidEmbedding: vector("centroid_embedding", { dimensions: TAXONOMY_EMBEDDING_DIMENSIONS }),
    searchDocument: tsvector("search_document")
      .generatedAlwaysAs(
        (): ReturnType<typeof sql> => sql`
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        `,
      )
      .notNull(),
    observationCount: bigint("observation_count", { mode: "number" }).notNull().default(0),
    state: varchar("state", { length: 16 }).$type<TaxonomyClusterState>().notNull().default("active"),
    mergedIntoClusterId: cuid("merged_into_cluster_id", { default: false }),
    firstObservedAt: tzTimestamp("first_observed_at").notNull(),
    lastObservedAt: tzTimestamp("last_observed_at").notNull(),
    clusteredAt: tzTimestamp("clustered_at").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("taxonomy_clusters"),
    index("taxonomy_clusters_project_state_idx").on(t.organizationId, t.projectId, t.state, t.lastObservedAt),
    index("taxonomy_clusters_parent_category_idx").on(t.organizationId, t.projectId, t.parentCategoryId),
    index("taxonomy_clusters_search_document_idx").using("gin", t.searchDocument),
  ],
)
