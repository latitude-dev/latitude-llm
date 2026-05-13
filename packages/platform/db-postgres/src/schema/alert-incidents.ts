import type { AlertIncidentKind, AlertIncidentSourceType, AlertSeverity } from "@domain/alerts"
import { index, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

export const alertIncidents = latitudeSchema.table(
  "alert_incidents",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    projectId: cuid("project_id").notNull(),
    sourceType: varchar("source_type", { length: 32 }).$type<AlertIncidentSourceType>().notNull(),
    sourceId: varchar("source_id", { length: 24 }).notNull(),
    kind: varchar("kind", { length: 64 }).$type<AlertIncidentKind>().notNull(),
    severity: varchar("severity", { length: 16 }).$type<AlertSeverity>().notNull(),
    startedAt: tzTimestamp("started_at").notNull(),
    endedAt: tzTimestamp("ended_at"),
    createdAt: tzTimestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    organizationRLSPolicy("alert_incidents"),
    index("alert_incidents_project_started_at_idx").on(t.organizationId, t.projectId, t.startedAt),
    index("alert_incidents_source_idx").on(t.sourceType, t.sourceId, t.startedAt),
  ],
)
