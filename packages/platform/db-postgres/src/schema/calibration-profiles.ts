import type { CalibrationScope } from "@domain/taxonomy"
import { integer, jsonb, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Per-project calibrated thresholds for the conversation-intelligence and
 * taxonomy pipelines. One row per (project, scope); payload shape is
 * scope-specific and validated by the domain schemas.
 */
export const calibrationProfiles = latitudeSchema.table(
  "calibration_profiles",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    scope: varchar("scope", { length: 32 }).$type<CalibrationScope>().notNull(),
    payload: jsonb("payload").notNull(),
    metrics: jsonb("metrics").notNull(),
    sampleSize: integer("sample_size").notNull().default(0),
    computedAt: tzTimestamp("computed_at").notNull(),
    createdAt: tzTimestamp("created_at").notNull(),
    updatedAt: tzTimestamp("updated_at").notNull(),
  },
  (t) => [
    organizationRLSPolicy("calibration_profiles"),
    uniqueIndex("calibration_profiles_project_scope_idx").on(t.organizationId, t.projectId, t.scope),
  ],
)
