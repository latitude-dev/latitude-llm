import { type DestinationId, destinationIdSchema, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  type DestinationSource,
  type DestinationSourceConfig,
  type DestinationSourceStatus,
  destinationSourceConfigSchema,
  destinationSourceSchema,
  destinationSourceStatusSchema,
} from "./destination-source.ts"

/**
 * One source enabled on one destination: its per-source config, enablement
 * status, and sync state. Extracted off the `destinations` row so each source
 * carries its own settings and advances at its own rate. The watermark is a
 * monotonic high-water mark over the source's change-ordered stream (spans:
 * `ingested_at`); `watermarkId` is the tie-breaker within a single watermark
 * value (spans: `span_id`). Disabling sets `status='disabled'` and keeps the
 * cursor — the sweep skips it; re-enabling resumes from where it left off.
 * Quarantine and credentials stay destination-level — they are not here.
 */
export const destinationSourceStateSchema = z
  .object({
    /** Denormalized for RLS; matches the parent destination's organization. */
    organizationId: organizationIdSchema,
    destinationId: destinationIdSchema,
    source: destinationSourceSchema,
    status: destinationSourceStatusSchema,
    config: destinationSourceConfigSchema,
    watermark: z.date(),
    /** Tie-breaker within one watermark value; `""` before the first advance. */
    watermarkId: z.string(),
    /** Earliest instant this source has taken responsibility for (live start, extended leftward by backfills); the upper bound for a historical backfill. */
    coverageStartAt: z.date(),
    backfillStartedAt: z.date().nullable(),
    backfillProgressAt: z.date().nullable(),
    lastRunAt: z.date().nullable(),
    consecutiveEmptyRuns: z.number().int().min(0),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine((s) => s.config.source === s.source, { message: "config.source must match the row's source" })

export type DestinationSourceState = z.infer<typeof destinationSourceStateSchema>

export const createDestinationSourceState = (params: {
  organizationId: OrganizationId
  destinationId: DestinationId
  source: DestinationSource
  config: DestinationSourceConfig
  status?: DestinationSourceStatus
  /** Sync starts here — new destinations begin at creation time (no backfill). */
  watermark: Date
  createdAt?: Date
}): DestinationSourceState => {
  const now = params.createdAt ?? new Date()
  return destinationSourceStateSchema.parse({
    organizationId: params.organizationId,
    destinationId: params.destinationId,
    source: params.source,
    status: params.status ?? "enabled",
    config: params.config,
    watermark: params.watermark,
    watermarkId: "",
    // Coverage begins where live begins; backfills extend it leftward.
    coverageStartAt: params.watermark,
    backfillStartedAt: null,
    backfillProgressAt: null,
    lastRunAt: null,
    consecutiveEmptyRuns: 0,
    createdAt: now,
    updatedAt: now,
  })
}
