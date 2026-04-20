import type { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

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
 * trace_search_embeddings (semantic) tables.
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
   * Only called for traces eligible under the semantic cap policy.
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

  /**
   * Count indexed documents for a project (for semantic cap check).
   */
  countDocumentsByProject(organizationId: OrganizationId, projectId: ProjectId): Effect.Effect<number, RepositoryError>
}

export class TraceSearchRepository extends ServiceMap.Service<TraceSearchRepository, TraceSearchRepositoryShape>()(
  "@domain/spans/TraceSearchRepository",
) {}
