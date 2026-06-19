import { z } from "zod"

/**
 * Telemetry sources a destination can export. v1: spans only. Append-only
 * sources slot in here freely; mutable sources (issues, behaviours) additionally
 * need soft-delete + the change-set deliverer (LAT-684, half B) before they can
 * be added. Which of these a given destination *kind* can actually receive is a
 * per-kind capability — see `DESTINATION_KIND_META[kind].supportedSources`.
 */
export const DESTINATION_SOURCES = ["spans"] as const
export const destinationSourceSchema = z.enum(DESTINATION_SOURCES)
export type DestinationSource = z.infer<typeof destinationSourceSchema>

/** A source enabled on a destination is swept; a disabled one keeps its cursor but is skipped. */
export const DESTINATION_SOURCE_STATUSES = ["enabled", "disabled"] as const
export const destinationSourceStatusSchema = z.enum(DESTINATION_SOURCE_STATUSES)
export type DestinationSourceStatus = z.infer<typeof destinationSourceStatusSchema>

/**
 * Per-source delivery config, discriminated on `source` (symmetric to the
 * kind-discriminated `destinationConfigSchema`). `excludePayloads` omits whole
 * content fields from the mapped output — field exclusion, not PII redaction.
 * The read page size is not configurable — see {@link DESTINATION_READ_PAGE_SIZE}.
 */
export const spansSourceConfigSchema = z.object({
  source: z.literal("spans"),
  excludePayloads: z.boolean().default(false),
})
export type SpansSourceConfig = z.infer<typeof spansSourceConfigSchema>

export const destinationSourceConfigSchema = z.discriminatedUnion("source", [spansSourceConfigSchema])
export type DestinationSourceConfig = z.infer<typeof destinationSourceConfigSchema>

/**
 * Partial per-source config for updates: `source` required, every other field
 * optional with **no defaults**. Merged onto the stored source config so a field
 * the caller omits is preserved instead of reset to the create-time default —
 * mirrors `destinationConfigPatchSchema`.
 */
const spansSourceConfigPatchSchema = z.object({
  source: z.literal("spans"),
  excludePayloads: z.boolean().optional(),
})
export const destinationSourceConfigPatchSchema = z.discriminatedUnion("source", [spansSourceConfigPatchSchema])
export type DestinationSourceConfigPatch = z.infer<typeof destinationSourceConfigPatchSchema>

/** Default config for a source, used when a destination enables it without explicit settings. */
export const defaultSourceConfig = (source: DestinationSource): DestinationSourceConfig =>
  destinationSourceConfigSchema.parse({ source })
