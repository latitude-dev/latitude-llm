import type { DestinationSource, DestinationSyncRunStatus, DestinationSyncRunTrigger } from "@domain/destinations"
import { index, integer, text, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Audit row per destination sync run (spec: `specs/data-destinations.md`).
 * Powers the settings UI ("last synced 3 min ago · 1,240 events") and
 * debugging; pruned after 30 days by the sweep. `organization_id` is
 * denormalized for RLS; `error` is sanitized (status + taxonomy, never
 * upstream response bodies). No FK on `destination_id`, per the platform rule.
 */
export const destinationSyncRuns = latitudeSchema.table(
  "destination_sync_runs",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    destinationId: cuid("destination_id", { default: false }).notNull(),
    source: varchar("source", { length: 32 }).notNull().$type<DestinationSource>(),
    // Live sweep vs. user-initiated backfill; existing rows default to 'live'.
    trigger: varchar("trigger", { length: 16 }).notNull().default("live").$type<DestinationSyncRunTrigger>(),
    windowStart: tzTimestamp("window_start").notNull(),
    windowEnd: tzTimestamp("window_end").notNull(),
    status: varchar("status", { length: 16 }).notNull().$type<DestinationSyncRunStatus>(),
    // Physical column stays `spans_read` (shipped in prod) — renamed to the source-agnostic `recordsRead` in code only, no migration.
    recordsRead: integer("spans_read").notNull(),
    eventsSent: integer("events_sent").notNull(),
    eventsDropped: integer("events_dropped").notNull().default(0),
    error: text("error"),
    startedAt: tzTimestamp("started_at").notNull(),
    finishedAt: tzTimestamp("finished_at").notNull(),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("destination_sync_runs"),
    index("destination_sync_runs_destination_id_started_at_idx").on(t.destinationId, t.startedAt),
    index("destination_sync_runs_finished_at_brin_idx").using("brin", t.finishedAt),
  ],
)
