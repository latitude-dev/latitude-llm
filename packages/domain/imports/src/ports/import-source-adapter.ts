import type { OrganizationId, ProjectId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { Context, type Effect } from "effect"
import type { ImportConfig, ImportCredentials, ImportPreviewConfig, ImportSource } from "../entities/import-source.ts"
import type { ImportSourceError } from "../errors.ts"

export interface SourceProject {
  readonly id: string
  readonly name: string
  readonly metadata?: Record<string, string>
}

/** One sampled span, before the spans of a trace fold into an {@link ImportTracePreview}. */
export interface NormalizedSpanPreview {
  readonly traceId: string
  readonly name: string
  readonly model: string
  readonly startTime: string
  readonly endTime: string
}

/** One trace of the sample, aggregated from the spans the preview page caught of it. */
export interface ImportTracePreview {
  readonly traceId: string
  readonly name: string
  readonly models: readonly string[]
  readonly startTime: string
  readonly durationNs: number
}

/** What a dry run can say about a range: how big it is, a sample of it, and any caveats. */
export interface ImportPreview {
  /**
   * Traces in the range, in the unit `maxTraces` budgets and billing charges. All three
   * sources can answer this in one request — Langfuse via `meta.totalItems` on the trace
   * list, LangSmith via `/runs/stats` with `is_root`, Braintrust via a BTQL
   * `count(distinct root_span_id)` — so `null` means the request failed, not that the
   * source cannot count.
   */
  readonly estimatedTraces: number | null
  readonly sample: readonly ImportTracePreview[]
  readonly warnings: readonly string[]
}

export interface FetchPageInput<TCursor> {
  readonly credentials: ImportCredentials
  readonly sourceProjectId: string
  readonly config: ImportConfig
  readonly cursor: TCursor | null
  readonly range: { readonly from: Date; readonly to: Date }
  readonly limit: number
}

export interface SourcePage<TRow, TCursor> {
  readonly rows: readonly TRow[]
  readonly nextCursor: TCursor | null
  readonly hasMore: boolean
}

export interface NormalizeContext {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly importJobId: string
  readonly source: ImportSource
  readonly sourceProjectId: string
  readonly ingestedAt: Date
  readonly retentionDays: number
}

export type NormalizeResult =
  | { readonly status: "ok"; readonly span: SpanDetail }
  | { readonly status: "skip"; readonly reason: string }

export interface ImportSourceAdapter<TRow, TCursor> {
  readonly source: ImportSource

  testConnection(input: { readonly credentials: ImportCredentials }): Effect.Effect<void, ImportSourceError>

  listProjects(input: {
    readonly credentials: ImportCredentials
    readonly cursor?: string
    readonly limit: number
  }): Effect.Effect<
    { readonly projects: readonly SourceProject[]; readonly nextCursor: string | null },
    ImportSourceError
  >

  preview(input: {
    readonly credentials: ImportCredentials
    readonly sourceProjectId: string
    readonly config: ImportPreviewConfig
    readonly range: { readonly from: Date; readonly to: Date }
    readonly maxRecords: number
  }): Effect.Effect<ImportPreview, ImportSourceError>

  fetchPage(input: FetchPageInput<TCursor>): Effect.Effect<SourcePage<TRow, TCursor>, ImportSourceError>

  normalize(row: TRow, context: NormalizeContext, config: ImportConfig): NormalizeResult
}

export type ImportSourceAdapterRegistry = {
  readonly [S in ImportSource]: ImportSourceAdapter<unknown, unknown>
}

export class ImportSourceAdapters extends Context.Service<ImportSourceAdapters, ImportSourceAdapterRegistry>()(
  "@domain/imports/ImportSourceAdapters",
) {}

export const getAdapter = (
  registry: ImportSourceAdapterRegistry,
  source: ImportSource,
): ImportSourceAdapter<unknown, unknown> => registry[source]
