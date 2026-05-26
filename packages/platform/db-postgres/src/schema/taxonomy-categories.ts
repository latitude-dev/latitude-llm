import {
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  type TaxonomyCategoryState,
} from "@domain/taxonomy"
import { sql } from "drizzle-orm"
import { bigint, customType, index, integer, varchar, vector } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
})

/**
 * Top-level grouping over clusters. Carries its own LLM-generated
 * name/description, a derived `centroid_embedding` over member cluster
 * centroids, and lifecycle state. Rebuilt by the gardening hierarchy step.
 */
export const taxonomyCategories = latitudeSchema.table(
  "taxonomy_categories",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    name: varchar("name", { length: TAXONOMY_CLUSTER_NAME_MAX_LENGTH }).notNull(),
    description: varchar("description", { length: TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH }).notNull(),
    centroidEmbedding: vector("centroid_embedding", { dimensions: TAXONOMY_EMBEDDING_DIMENSIONS }),
    searchDocument: tsvector("search_document")
      .generatedAlwaysAs(
        (): ReturnType<typeof sql> => sql`
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        `,
      )
      .notNull(),
    clusterCount: integer("cluster_count").notNull().default(0),
    observationCount: bigint("observation_count", { mode: "number" }).notNull().default(0),
    state: varchar("state", { length: 16 }).$type<TaxonomyCategoryState>().notNull().default("active"),
    clusteredAt: tzTimestamp("clustered_at").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("taxonomy_categories"),
    index("taxonomy_categories_project_state_idx").on(t.organizationId, t.projectId, t.state),
    index("taxonomy_categories_search_document_idx").using("gin", t.searchDocument),
  ],
)
