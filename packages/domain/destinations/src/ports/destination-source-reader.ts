import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { Context, type Effect } from "effect"
import type { DestinationSource } from "../entities/destination-source.ts"

/** Position in a source's monotonic change-ordered stream: high-water mark + tie-breaker within one watermark value. */
export interface SourceCursor {
  readonly watermark: Date
  readonly id: string
}

/**
 * The record type each source yields and its mapper consumes — one entry per
 * {@link DestinationSource} member. Keeps the reader registry and the engine
 * type-safe per source: adding a source whose mapper still expects spans
 * surfaces as a compile error rather than a silent mismatch.
 */
export interface SourceRecordTypes {
  readonly spans: SpanDetail
}

/**
 * A settled window of source records, deduped and ordered by `(watermark, id)`
 * strictly after the cursor and up to `windowEnd`, capped at `limit`.
 * `nextCursor` is the last returned pair (null on an empty window) — resume from
 * it to continue a limit-truncated window without losing records.
 */
export interface SourceWindow<TRecord> {
  readonly records: readonly TRecord[]
  readonly nextCursor: SourceCursor | null
}

/**
 * Read half of the source contract: a settled-row window read over one source.
 * The engine depends on this, not a concrete repository, so adding a source is a
 * new reader in the registry. The `ChSqlClient` requirement is the spans
 * reader's; it generalizes to the source's own client when a non-ClickHouse
 * source lands.
 */
export interface DestinationSourceReader<TRecord> {
  listWindow(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly cursor: SourceCursor
    readonly windowEnd: Date
    readonly limit: number
  }): Effect.Effect<SourceWindow<TRecord>, RepositoryError, ChSqlClient>
  /**
   * The most recent `limit` records of this source for a project, newest first —
   * a cursor-free representative sample. Powers the delivery preview; never used
   * by the sync engine.
   */
  sampleLatest(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly TRecord[], RepositoryError, ChSqlClient>
}

/** Per-source reader registry — each source's reader yields that source's record type. TS-enforced like the deliverer/mapper registries. */
export type DestinationSourceReaderRegistry = {
  readonly [S in DestinationSource]: DestinationSourceReader<SourceRecordTypes[S]>
}

export class DestinationSourceReaders extends Context.Service<
  DestinationSourceReaders,
  DestinationSourceReaderRegistry
>()("@domain/destinations/DestinationSourceReaders") {}
