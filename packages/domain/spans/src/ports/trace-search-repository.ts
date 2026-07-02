import type { OrganizationId, ProjectId, RepositoryError, SessionId, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { MessageEmbeddingRole } from "../helpers/message-embedding.ts"

export interface TraceSemanticHighlightMatch {
  readonly chunkIndex: number
  readonly firstMessageIndex: number | null
  readonly lastMessageIndex: number | null
  readonly relevanceScore: number
}

export interface TraceSearchDocumentRow {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly startTime: Date
  readonly rootSpanName: string
  readonly searchText: string
  readonly contentHash: string
  readonly retentionDays?: number
}

export interface TraceSearchEmbeddingRow {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  /** 0-based contiguous chunk index within the trace. Part of the dedup key. */
  readonly chunkIndex: number
  readonly startTime: Date
  readonly contentHash: string
  readonly embeddingModel: string
  readonly embedding: readonly number[]
  readonly retentionDays?: number
  readonly firstMessageIndex?: number
  readonly lastMessageIndex?: number
}

export interface TraceMessageOccurrenceRow {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly messageIndex: number
  readonly contentHash: string
  readonly sessionId: SessionId
  readonly startTime: Date
  readonly role: MessageEmbeddingRole
  readonly isOutput: boolean
  readonly retentionDays?: number
}

/** The latest content hash + role at a trace message position (deduped by `indexed_at`). */
export interface TraceMessageOccurrenceContent {
  readonly contentHash: string
  readonly role: MessageEmbeddingRole
}

/**
 * Repository port for trace search indexing operations.
 *
 * Handles upserts to trace_search_documents (lexical), legacy
 * trace_search_embeddings rows, and trace_message_occurrences. Query-side
 * project search runs inline as a subquery inside the main `traces` SQL in
 * `TraceRepositoryLive`, so the port intentionally exposes only write/dedup
 * ops plus the single-trace semantic highlight lookup.
 */
export interface TraceSearchRepositoryShape {
  /**
   * Upsert a lexical search document.
   * Uses ReplacingMergeTree semantics - later indexed_at wins.
   */
  upsertDocument(row: TraceSearchDocumentRow): Effect.Effect<void, RepositoryError>

  /**
   * Upsert a semantic search embedding.
   * Uses ReplacingMergeTree semantics - later indexed_at wins.
   */
  upsertEmbedding(row: TraceSearchEmbeddingRow): Effect.Effect<void, RepositoryError>

  /**
   * Upsert per-trace message occurrence rows for shared message embeddings.
   * Rows are idempotent under ReplacingMergeTree by trace message position;
   * later content at the same trace_id + message_index replaces older hashes.
   */
  upsertMessageOccurrences(rows: readonly TraceMessageOccurrenceRow[]): Effect.Effect<void, RepositoryError>

  /**
   * List the (deduped) content hashes + roles for a session's traces. Filtered
   * by `trace_id` to hit the occurrences sort key. Backs the semantic-similarity
   * host (mapping session messages → shared embeddings) and the readiness signal
   * that embeddings have been indexed; an empty result means "not yet indexed".
   */
  listMessageOccurrencesForTraces(args: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<readonly TraceMessageOccurrenceContent[], RepositoryError>

  /**
   * Check if a chunk row exists for this trace at this chunk_index with the
   * given content hash. Used to skip redundant per-chunk embedding work when
   * the chunk's contents haven't changed since the last index.
   */
  hasEmbeddingWithHash(
    organizationId: OrganizationId,
    projectId: ProjectId,
    traceId: TraceId,
    chunkIndex: number,
    contentHash: string,
  ): Effect.Effect<boolean, RepositoryError>

  /**
   * Cosine-scan the chunks of a single trace against `queryEmbedding` and
   * return the winning chunk's metadata. Used by `getTraceSearchHighlights`
   * to paint the semantic-region highlight (LAT-601).
   *
   * Returns `null` when the trace has no chunk rows (TTL'd, never indexed,
   * or pre-PR-2 in flight). When the winning chunk predates migration 00017,
   * `firstMessageIndex` / `lastMessageIndex` come back NULL — caller falls
   * back to literal/token highlights only.
   */
  findSemanticHighlightForTrace(args: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
    readonly queryEmbedding: readonly number[]
  }): Effect.Effect<TraceSemanticHighlightMatch | null, RepositoryError>
}

export class TraceSearchRepository extends Context.Service<TraceSearchRepository, TraceSearchRepositoryShape>()(
  "@domain/spans/TraceSearchRepository",
) {}
