import type { AlertSeverity, IncidentEntrySignals } from "@domain/incidents"
import type { AlertIncidentCondition, IncidentSourceType } from "@domain/shared"
import { sql } from "drizzle-orm"
import { index, jsonb, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const incidents = latitudeSchema.table(
  "incidents",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    sourceType: varchar("source_type", { length: 32 }).$type<IncidentSourceType>().notNull(),
    sourceId: varchar("source_id", { length: 24 }).notNull(),
    severity: varchar("severity", { length: 16 }).$type<AlertSeverity>().notNull(),
    condition: jsonb("condition").$type<AlertIncidentCondition>(),
    entrySignals: jsonb("entry_signals").$type<IncidentEntrySignals>(),
    exitEligibleSince: tzTimestamp("exit_eligible_since"),
    startedAt: tzTimestamp("started_at").notNull(),
    endedAt: tzTimestamp("ended_at"),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    organizationRLSPolicy("incidents"),
    index("incidents_project_started_at_idx").on(t.organizationId, t.projectId, t.startedAt),
    index("incidents_source_idx").on(t.sourceType, t.sourceId, t.startedAt),
    uniqueIndex("incidents_open_source_idx")
      .on(t.organizationId, t.sourceType, t.sourceId)
      .where(sql`ended_at IS NULL`),
  ],
)

export const alertIncidents = incidents
