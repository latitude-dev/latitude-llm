import type { TaxonomyRunStatus, TaxonomyRunTrigger } from "@domain/taxonomy"
import { index, integer, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/** One row per gardening run per project; used for monitoring + lineage joins. */
export const taxonomyRuns = latitudeSchema.table(
  "taxonomy_runs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    trigger: varchar("trigger", { length: 16 }).$type<TaxonomyRunTrigger>().notNull(),
    status: varchar("status", { length: 16 }).$type<TaxonomyRunStatus>().notNull(),
    startedAt: tzTimestamp("started_at").notNull(),
    completedAt: tzTimestamp("completed_at"),
    observationsScanned: integer("observations_scanned").notNull().default(0),
    noiseScanned: integer("noise_scanned").notNull().default(0),
    clustersBorn: integer("clusters_born").notNull().default(0),
    clustersMerged: integer("clusters_merged").notNull().default(0),
    clustersDeprecated: integer("clusters_deprecated").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    organizationRLSPolicy("taxonomy_runs"),
    index("taxonomy_runs_project_started_idx").on(t.organizationId, t.projectId, t.startedAt),
  ],
)
