import type { NotFoundError, ProjectId, RepositoryError, SqlClient, TraceId } from "@domain/shared"
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

export interface InsertManyAcrossQueuesInput {
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly traceCreatedAt: Date
  readonly queueIds: readonly string[]
}

export interface GetAdjacentItemsInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly currentItemId: string
}

export interface AdjacentItems {
  readonly previousItemId: string | null
  readonly nextItemId: string | null
}

export interface GetQueuePositionInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly currentItemId: string
}

export interface QueuePosition {
  readonly currentIndex: number
  readonly totalItems: number
}

export interface UpdateAnnotationQueueItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly itemId: string
  readonly completedAt?: Date | null
  readonly completedBy?: string | null
  readonly reviewStartedAt?: Date | null
}

export interface GetNextUncompletedItemInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly currentItemId: string
}

export interface ListByTraceIdInput {
  readonly projectId: ProjectId
  readonly traceId: string
}

export interface AnnotationQueueItemRepositoryShape {
  listByQueue(
    input: ListAnnotationQueueItemsInput,
  ): Effect.Effect<AnnotationQueueItemListPage, RepositoryError, SqlClient>
  findById(input: FindAnnotationQueueItemInput): Effect.Effect<AnnotationQueueItem | null, RepositoryError, SqlClient>
  /**
   * Insert a queue item if no item with the same (organizationId, projectId, queueId, traceId)
   * exists. Returns true if inserted, false if a conflict was encountered.
   * This is idempotent and safe for concurrent use.
   */
  insertIfNotExists(input: InsertAnnotationQueueItemInput): Effect.Effect<boolean, RepositoryError, SqlClient>
  /**
   * Bulk insert queue items using INSERT ... ON CONFLICT DO NOTHING.
   * Returns the count of actually inserted rows.
   * This is idempotent and safe for concurrent use.
   */
  bulkInsertIfNotExists(
    input: BulkInsertAnnotationQueueItemInput,
  ): Effect.Effect<{ insertedCount: number }, RepositoryError, SqlClient>
  /**
   * Insert one trace into multiple queues in a single batch operation.
   * Uses INSERT ... ON CONFLICT DO NOTHING and returns the queue IDs that had actual inserts.
   * This is idempotent and safe for concurrent use.
   */
  insertManyAcrossQueues(
    input: InsertManyAcrossQueuesInput,
  ): Effect.Effect<{ insertedQueueIds: readonly string[] }, RepositoryError, SqlClient>
  listByTraceId(input: ListByTraceIdInput): Effect.Effect<readonly AnnotationQueueItem[], RepositoryError, SqlClient>
  getAdjacentItems(input: GetAdjacentItemsInput): Effect.Effect<AdjacentItems, RepositoryError, SqlClient>
  getQueuePosition(input: GetQueuePositionInput): Effect.Effect<QueuePosition, RepositoryError, SqlClient>
  update(
    input: UpdateAnnotationQueueItemInput,
  ): Effect.Effect<AnnotationQueueItem, RepositoryError | NotFoundError, SqlClient>
  /**
   * Finds the first uncompleted item in the queue ordered by `traceCreatedAt DESC`.
   * Returns null if all items in the queue are completed.
   */
  getNextUncompletedItem(input: GetNextUncompletedItemInput): Effect.Effect<string | null, RepositoryError, SqlClient>
}

export class AnnotationQueueItemRepository extends ServiceMap.Service<
  AnnotationQueueItemRepository,
  AnnotationQueueItemRepositoryShape
>()("@domain/annotation-queues/AnnotationQueueItemRepository") {}
