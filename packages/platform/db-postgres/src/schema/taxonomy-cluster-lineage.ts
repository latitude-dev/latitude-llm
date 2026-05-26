import type { TaxonomyLineageTransitionType } from "@domain/taxonomy"
import { sql } from "drizzle-orm"
import { doublePrecision, index, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Append-only transition log: one row per detected gardening transition.
 * MVP only writes `birth`, `death`, `merge`. `continuation` and `split`
 * are reserved values surfaced by the Hungarian-lineage Future Work.
 */
export const taxonomyClusterLineage = latitudeSchema.table(
  "taxonomy_cluster_lineage",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    runId: cuid("run_id").notNull(),
    transitionType: varchar("transition_type", { length: 16 }).$type<TaxonomyLineageTransitionType>().notNull(),
    /** Native Postgres `varchar[]`; no separate join table per the no-FK rule. */
    fromClusterIds: varchar("from_cluster_ids", { length: 24 }).array().notNull().default(sql`'{}'`),
    toClusterIds: varchar("to_cluster_ids", { length: 24 }).array().notNull().default(sql`'{}'`),
    similarity: doublePrecision("similarity"),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    organizationRLSPolicy("taxonomy_cluster_lineage"),
    index("taxonomy_cluster_lineage_project_created_idx").on(t.organizationId, t.projectId, t.createdAt),
  ],
)
