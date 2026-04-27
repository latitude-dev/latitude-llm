import type { FilterSet } from "@domain/shared"
import { z } from "zod"

/**
 * Export kinds supported by the shared export rail.
 */
export type ExportKind = "dataset" | "traces" | "issues"

/**
 * Row selection modes for dataset exports.
 */
export type ExportSelection =
  | { readonly mode: "selected"; readonly rowIds: readonly string[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly rowIds: readonly string[] }

export const exportSelectionSchema: z.ZodType<ExportSelection> = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("selected"), rowIds: z.array(z.string()).min(1) }),
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("allExcept"), rowIds: z.array(z.string()) }),
])

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
  readonly selection: ExportSelection
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
        readonly field: "lastSeen" | "occurrences" | "state"
        readonly direction: "asc" | "desc"
      }
    | undefined
}

/**
 * Discriminated union of all export job payloads.
 */
export type ExportPayload = DatasetExportPayload | TracesExportPayload | IssuesExportPayload
