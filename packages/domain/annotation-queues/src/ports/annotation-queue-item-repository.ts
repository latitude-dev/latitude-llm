import type { ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"

/**
 * Keyset cursor for queue item lists. Encoding depends on {@link AnnotationQueueItemListSortBy}:
 * - `createdAt`: `sortValue` is ISO 8601 `created_at`; `statusRank` omitted.
 * - `status`: `sortValue` is ISO 8601 `created_at`; `statusRank` is the status tier (0–2).
 */
export interface AnnotationQueueItemListCursor {
  readonly sortValue: string
  readonly id: string
  readonly statusRank?: number
}

export type AnnotationQueueItemListSortBy = "createdAt" | "status"

export interface AnnotationQueueItemListOptions {
  readonly limit?: number
  readonly cursor?: AnnotationQueueItemListCursor
  readonly sortBy?: AnnotationQueueItemListSortBy
  readonly sortDirection?: "asc" | "desc"
}

export interface AnnotationQueueItemListPage {
  readonly items: readonly AnnotationQueueItem[]
  readonly hasMore: boolean
  readonly nextCursor?: AnnotationQueueItemListCursor
}

export interface ListAnnotationQueueItemsInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly options: AnnotationQueueItemListOptions
}

export interface FindAnnotationQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly itemId: string
}

export interface InsertAnnotationQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly traceId: TraceId
  readonly traceCreatedAt: Date
}

export interface BulkInsertAnnotationQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly items: ReadonlyArray<{ readonly traceId: TraceId; readonly traceCreatedAt: Date }>
}

export interface AnnotationQueueItemRepositoryShape {
  listByQueue(input: ListAnnotationQueueItemsInput): Effect.Effect<AnnotationQueueItemListPage, RepositoryError>
  findById(input: FindAnnotationQueueItemInput): Effect.Effect<AnnotationQueueItem | null, RepositoryError>
  /**
   * Insert a queue item if no item with the same (organizationId, projectId, queueId, traceId)
   * exists. Returns true if inserted, false if a conflict was encountered.
   * This is idempotent and safe for concurrent use.
   */
  insertIfNotExists(input: InsertAnnotationQueueItemInput): Effect.Effect<boolean, RepositoryError>
  /**
   * Bulk insert queue items using INSERT ... ON CONFLICT DO NOTHING.
   * Returns the count of actually inserted rows.
   * This is idempotent and safe for concurrent use.
   */
  bulkInsertIfNotExists(
    input: BulkInsertAnnotationQueueItemInput,
  ): Effect.Effect<{ insertedCount: number }, RepositoryError>
}

export class AnnotationQueueItemRepository extends ServiceMap.Service<
  AnnotationQueueItemRepository,
  AnnotationQueueItemRepositoryShape
>()("@domain/annotation-queues/AnnotationQueueItemRepository") {}
