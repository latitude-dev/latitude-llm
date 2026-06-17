import type { DestinationSource, DestinationSourceConfig, DestinationSourceStatus } from "@domain/destinations"
import { index, integer, jsonb, primaryKey, varchar } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, timestamps, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Per-`(destination, source)` row (spec: `data-destinations.md` → Source
 * contract): the source's enablement status, per-source config, and sync state.
 * Extracted off `destinations` so each source carries its own settings and
 * advances/backs off independently.
 *
 * - `status` gates the sweep — `disabled` rows keep their cursor but are skipped.
 * - `config` is the source-discriminated non-secret shape (payload exclusion,
 *   per-run cap), validated by `destinationSourceConfigSchema` in
 *   `@domain/destinations`.
 * - `(watermark, watermark_id)` is the compound cursor (spans: `ingested_at` +
 *   `span_id`); advances only via the repository's optimistic CAS update.
 * - `last_run_at` + `consecutive_empty_runs` drive sweep due-selection with
 *   idle backoff.
 * - `organization_id` is denormalized for RLS. No FK on `destination_id`, per
 *   the platform rule — the delete cascade is application-layer.
 */
export const destinationSources = latitudeSchema.table(
  "destination_sources",
  {
    organizationId: cuid("organization_id").notNull(),
    destinationId: cuid("destination_id", { default: false }).notNull(),
    source: varchar("source", { length: 32 }).notNull().$type<DestinationSource>(),
    status: varchar("status", { length: 16 }).notNull().default("enabled").$type<DestinationSourceStatus>(),
    config: jsonb("config").notNull().$type<DestinationSourceConfig>(),
    watermark: tzTimestamp("watermark").notNull(),
    watermarkId: varchar("watermark_id", { length: 32 }).notNull().default(""),
    // Earliest instant this source has taken responsibility for; backfills extend it leftward, the historical-export upper bound.
    coverageStartAt: tzTimestamp("coverage_start_at").defaultNow().notNull(),
    backfillStartedAt: tzTimestamp("backfill_started_at"),
    backfillProgressAt: tzTimestamp("backfill_progress_at"),
    lastRunAt: tzTimestamp("last_run_at"),
    consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    organizationRLSPolicy("destination_sources"),
    primaryKey({ columns: [t.destinationId, t.source] }),
    index("destination_sources_last_run_at_idx").on(t.lastRunAt),
  ],
)
