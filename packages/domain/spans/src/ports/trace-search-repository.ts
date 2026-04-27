import type { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { type Effect, Context } from "effect"

export interface TraceSearchDocumentRow {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly startTime: Date
  readonly rootSpanName: string
  readonly searchText: string
  readonly contentHash: string
}

export interface TraceSearchEmbeddingRow {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly startTime: Date
  readonly contentHash: string
  readonly embeddingModel: string
  readonly embedding: readonly number[]
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
   * Check if a trace already has an embedding with the given content hash.
   * Used to skip redundant embedding generation.
   */
  hasEmbeddingWithHash(
    organizationId: OrganizationId,
    projectId: ProjectId,
    traceId: TraceId,
    contentHash: string,
  ): Effect.Effect<boolean, RepositoryError>
}

export class TraceSearchRepository extends Context.Service<TraceSearchRepository, TraceSearchRepositoryShape>()(
  "@domain/spans/TraceSearchRepository",
) {}
