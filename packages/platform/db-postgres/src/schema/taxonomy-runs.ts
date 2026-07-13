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
    // NULL = global gardening run; non-null scopes the run to a custom behavior.
    customBehaviorId: cuid("custom_behavior_id", { default: false }),
    trigger: varchar("trigger", { length: 16 }).$type<TaxonomyRunTrigger>().notNull(),
    status: varchar("status", { length: 16 }).$type<TaxonomyRunStatus>().notNull(),
    startedAt: tzTimestamp("started_at").notNull(),
    completedAt: tzTimestamp("completed_at"),
    observationsScanned: integer("observations_scanned").notNull().default(0),
    observationsAvailable: integer("observations_available").notNull().default(0),
    observationsSampled: integer("observations_sampled").notNull().default(0),
    sampleStrategy: varchar("sample_strategy", { length: 64 }).notNull().default("day_stratified_hash_round_robin"),
    sampleCap: integer("sample_cap").notNull().default(1500),
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
