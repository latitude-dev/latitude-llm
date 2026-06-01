import type { AlertIncidentCondition, AlertIncidentKind, AlertIncidentSourceType, AlertSeverity } from "@domain/shared"
import { sql } from "drizzle-orm"
import { index, jsonb, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

export const monitorAlerts = latitudeSchema.table(
  "monitor_alerts",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    monitorId: cuid("monitor_id", { default: false }).notNull(),
    kind: varchar("kind", { length: 64 }).$type<AlertIncidentKind>().notNull(),
    sourceType: varchar("source_type", { length: 32 }).$type<AlertIncidentSourceType>().notNull(),
    sourceId: varchar("source_id", { length: 24 }), // null = "all of source_type"
    condition: jsonb("condition").$type<AlertIncidentCondition>(), // null for kinds with no params
    severity: varchar("severity", { length: 16 }).$type<AlertSeverity>().notNull(),
    // Soft delete, never hard: keeps historical alert_incidents.monitor_alert_id
    // pointers resolvable so the incidents list can join back to the monitor.
    deletedAt: tzTimestamp("deleted_at"),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("monitor_alerts"),
    // Non-partial: the incidents→monitor join must resolve soft-deleted alerts too.
    index("monitor_alerts_monitor_idx").on(t.monitorId),
    // Partial: the firing scan only wants live alerts.
    index("monitor_alerts_source_idx").on(t.organizationId, t.sourceType, t.sourceId).where(sql`deleted_at IS NULL`),
  ],
)
