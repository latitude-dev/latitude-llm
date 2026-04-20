import type { FilterSet } from "@domain/shared"
import { z } from "zod"

/**
 * Export kinds supported by the shared export rail.
 */
export const EXPORT_KINDS = ["dataset", "traces", "issues"] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

export const exportKindSchema = z.enum(EXPORT_KINDS)

/**
 * Row selection modes for dataset exports.
 */
export type DatasetExportSelection =
  | { readonly mode: "selected"; readonly rowIds: readonly string[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly rowIds: readonly string[] }

export const datasetExportSelectionSchema: z.ZodType<DatasetExportSelection> = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("selected"), rowIds: z.array(z.string()).min(1) }),
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("allExcept"), rowIds: z.array(z.string()) }),
])

export type ExportSelection = DatasetExportSelection

export const exportSelectionSchema = datasetExportSelectionSchema

/**
 * Base export job payload shared across all export kinds.
 */
export interface BaseExportPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly recipientEmail: string
}

/**
 * Dataset export job payload.
 */
export interface DatasetExportPayload extends BaseExportPayload {
  readonly kind: "dataset"
  readonly datasetId: string
  readonly selection: DatasetExportSelection
}

/**
 * Traces export job payload.
 */
export interface TracesExportPayload extends BaseExportPayload {
  readonly kind: "traces"
  readonly filters?: FilterSet | undefined
  readonly selection?: ExportSelection | undefined
}

/**
 * Issues export job payload (no extra filters for v1).
 */
export interface IssuesExportPayload extends BaseExportPayload {
  readonly kind: "issues"
  readonly selection?: ExportSelection | undefined
  readonly lifecycleGroup?: "active" | "archived" | undefined
  readonly searchQuery?: string | undefined
  readonly timeRange?:
    | {
        readonly fromIso?: string | undefined
        readonly toIso?: string | undefined
      }
    | undefined
  readonly sort?:
    | {
        readonly field: "lastSeen" | "occurrences"
        readonly direction: "asc" | "desc"
      }
    | undefined
}

/**
 * Discriminated union of all export job payloads.
 */
export type ExportPayload = DatasetExportPayload | TracesExportPayload | IssuesExportPayload

/**
 * Zod schemas for export payloads.
 */
export const baseExportPayloadSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  recipientEmail: z.string().email(),
})

export const datasetExportPayloadSchema = baseExportPayloadSchema.extend({
  kind: z.literal("dataset"),
  datasetId: z.string(),
  selection: datasetExportSelectionSchema,
})

const filterConditionSchema = z.object({
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "notIn", "contains", "notContains"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
})

export const tracesExportPayloadSchema = baseExportPayloadSchema.extend({
  kind: z.literal("traces"),
  filters: z.record(z.string(), z.array(filterConditionSchema)).optional(),
  selection: exportSelectionSchema.optional(),
})

export const issuesExportPayloadSchema = baseExportPayloadSchema.extend({
  kind: z.literal("issues"),
  selection: exportSelectionSchema.optional(),
  lifecycleGroup: z.enum(["active", "archived"]).optional(),
  searchQuery: z.string().optional(),
  timeRange: z
    .object({
      fromIso: z.iso.datetime().optional(),
      toIso: z.iso.datetime().optional(),
    })
    .optional(),
  sort: z
    .object({
      field: z.enum(["lastSeen", "occurrences"]),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
})

export const exportPayloadSchema = z.discriminatedUnion("kind", [
  datasetExportPayloadSchema,
  tracesExportPayloadSchema,
  issuesExportPayloadSchema,
]) as z.ZodType<ExportPayload>

/**
 * Progress tracking for resumable exports in workflow activities.
 */
export interface ExportProgress {
  readonly processedCount: number
  readonly hasMore: boolean
}

/**
 * State for resumable export workflow.
 */
export interface ExportWorkflowState {
  readonly fileKey: string
  readonly filename: string
  readonly processedCount: number
  readonly isComplete: boolean
  readonly error?: string
}
