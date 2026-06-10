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

/**
 * Repository port for trace search indexing operations.
 *
 * Handles upserts to trace_search_documents (lexical) and
 * trace_message_occurrences (links from trace message positions to shared
 * message_embeddings vectors). Query-side project search runs inline as a
 * subquery inside the main `traces` SQL in `TraceRepositoryLive`, so the port
 * intentionally exposes only writes plus the single-trace semantic highlight
 * lookup.
 */
export interface TraceSearchRepositoryShape {
  /**
   * Upsert a lexical search document.
   * Uses ReplacingMergeTree semantics - later indexed_at wins.
   */
  upsertDocument(row: TraceSearchDocumentRow): Effect.Effect<void, RepositoryError>

  /**
   * Upsert per-trace message occurrence rows for shared message embeddings.
   * Rows are idempotent under ReplacingMergeTree by trace message position;
   * later content at the same trace_id + message_index replaces older hashes.
   */
  upsertMessageOccurrences(rows: readonly TraceMessageOccurrenceRow[]): Effect.Effect<void, RepositoryError>

  /**
   * Cosine-scan the shared message vectors linked to a single trace against
   * `queryEmbedding` and return the winning message's metadata. Used by
   * `getTraceSearchHighlights` to paint the semantic-region highlight.
   *
   * Returns `null` when the trace has no occurrence rows, has no matching
   * shared embeddings, or only has non-semantic roles.
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
