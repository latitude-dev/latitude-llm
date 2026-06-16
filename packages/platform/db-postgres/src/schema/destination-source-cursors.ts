import type { DestinationSource } from "@domain/destinations"
import { index, integer, primaryKey, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Per-`(destination, source)` sync state (spec: `data-destinations.md` → Source
 * contract). Extracted off `destinations` so each source advances and backs off
 * independently.
 *
 * - `(watermark, watermark_id)` is the compound cursor (spans: `ingested_at` +
 *   `span_id`); advances only via the repository's optimistic CAS update.
 * - `last_run_at` + `consecutive_empty_runs` drive sweep due-selection with
 *   idle backoff.
 * - `organization_id` is denormalized for RLS. No FK on `destination_id`, per
 *   the platform rule — the delete cascade is application-layer.
 */
export const destinationSourceCursors = latitudeSchema.table(
  "destination_source_cursors",
  {
    organizationId: cuid("organization_id").notNull(),
    destinationId: cuid("destination_id", { default: false }).notNull(),
    source: varchar("source", { length: 32 }).notNull().$type<DestinationSource>(),
    watermark: tzTimestamp("watermark").notNull(),
    watermarkId: varchar("watermark_id", { length: 32 }).notNull().default(""),
    lastRunAt: tzTimestamp("last_run_at"),
    consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("destination_source_cursors"),
    primaryKey({ columns: [t.destinationId, t.source] }),
    index("destination_source_cursors_last_run_at_idx").on(t.lastRunAt),
  ],
)
