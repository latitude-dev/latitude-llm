import type { AlertIncidentKind, AlertIncidentSourceType, AlertSeverity, EntrySignalsSnapshot } from "@domain/alerts"
import type { AlertIncidentCondition } from "@domain/shared"
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
    // The firing alert, or null for legacy/flag-off incidents. The owning
    // monitor is NOT denormalised — recovered by joining through monitor_alerts
    // (soft-deleted, so the join survives alert removal).
    monitorAlertId: cuid("monitor_alert_id", { default: false }),
    // Snapshot of the firing alert's condition at open time, so monitor edits
    // mid-incident don't change the close-side or notification copy.
    condition: jsonb("condition").$type<AlertIncidentCondition>(),
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
    // Composite, leading on monitor_alert_id so it serves both the equality
    // lookups (saved-search "open incident for this alert") and the keyset
    // pagination (started_at DESC, id DESC) of the monitor incidents list.
    // Partial — most legacy rows are null.
    index("alert_incidents_monitor_alert_idx")
      .on(t.monitorAlertId, t.startedAt.desc(), t.id.desc())
      .where(sql`monitor_alert_id IS NOT NULL`),
  ],
)
