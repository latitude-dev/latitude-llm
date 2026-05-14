import type { AlertIncidentKind, AlertIncidentSourceType, AlertSeverity, EntrySignalsSnapshot } from "@domain/alerts"
import { sql } from "drizzle-orm"
import { index, jsonb, varchar } from "drizzle-orm/pg-core"
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
    // Frozen at entry for `issue.escalating` incidents so the close-side detector
    // can compare against the conditions that tripped open. `NULL` for legacy rows
    // and for kinds that don't escalate (`issue.new`, `issue.regressed`).
    entrySignals: jsonb("entry_signals").$type<EntrySignalsSnapshot>(),
    // Marks when the band-shape exit condition first started holding. Cleared
    // back to NULL whenever it fails again. Once `now - exitEligibleSince` clears
    // the dwell threshold, the incident is closed.
    exitEligibleSince: tzTimestamp("exit_eligible_since"),
  },
  (t) => [
    organizationRLSPolicy("alert_incidents"),
    index("alert_incidents_project_started_at_idx").on(t.organizationId, t.projectId, t.startedAt),
    index("alert_incidents_source_idx").on(t.sourceType, t.sourceId, t.startedAt),
    // Partial index over only the open rows, keyed on `kind`. Backs the
    // hourly escalation sweep's `WHERE kind = ? AND ended_at IS NULL` lookup
    // without paying for the full-table index — open incidents are a tiny
    // fraction of total volume.
    index("alert_incidents_open_by_kind_idx").on(t.kind).where(sql`ended_at IS NULL`),
  ],
)
