import type { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { Context, type Effect } from "effect"

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

/**
 * Repository port for trace search indexing operations.
 *
 * Handles upserts to trace_search_documents (lexical) and
 * trace_search_embeddings (semantic) tables. Query-side semantic retrieval
 * runs inline as a subquery inside the main `traces` SQL in
 * `TraceRepositoryLive`, so the port intentionally exposes only write/dedup
 * ops — a standalone `querySemanticCandidates` method would duplicate the
 * cosine-distance SQL that the repository already embeds.
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
