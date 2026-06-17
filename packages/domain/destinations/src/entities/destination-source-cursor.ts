import { type DestinationId, destinationIdSchema, type OrganizationId, organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import { type DestinationSource, destinationSourceSchema } from "./destination-source.ts"

/**
 * Per-`(destination, source)` sync state. Extracted off the `destinations` row
 * so each source advances at its own rate and backs off independently. The
 * watermark is a monotonic high-water mark over the source's change-ordered
 * stream (spans: `ingested_at`); `watermarkId` is the tie-breaker within a
 * single watermark value (spans: `span_id`). Quarantine and credentials remain
 * destination-level — they are not here.
 */
export const destinationSourceCursorSchema = z.object({
  /** Denormalized for RLS; matches the parent destination's organization. */
  organizationId: organizationIdSchema,
  destinationId: destinationIdSchema,
  source: destinationSourceSchema,
  watermark: z.date(),
  /** Tie-breaker within one watermark value; `""` before the first advance. */
  watermarkId: z.string(),
  lastRunAt: z.date().nullable(),
  consecutiveEmptyRuns: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DestinationSourceCursor = z.infer<typeof destinationSourceCursorSchema>

export const createDestinationSourceCursor = (params: {
  organizationId: OrganizationId
  destinationId: DestinationId
  source: DestinationSource
  /** Sync starts here — new destinations begin at creation time (no backfill). */
  watermark: Date
  createdAt?: Date
}): DestinationSourceCursor => {
  const now = params.createdAt ?? new Date()
  return destinationSourceCursorSchema.parse({
    organizationId: params.organizationId,
    destinationId: params.destinationId,
    source: params.source,
    watermark: params.watermark,
    watermarkId: "",
    lastRunAt: null,
    consecutiveEmptyRuns: 0,
    createdAt: now,
    updatedAt: now,
  })
}
