import type { ProjectId, RepositoryError } from "@domain/shared"
import { type Effect } from "effect"
import { EffectService } from "@repo/effect-service"
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

export interface AnnotationQueueItemRepositoryShape {
  listByQueue(input: ListAnnotationQueueItemsInput): Effect.Effect<AnnotationQueueItemListPage, RepositoryError>
  findById(input: FindAnnotationQueueItemInput): Effect.Effect<AnnotationQueueItem | null, RepositoryError>
}

export class AnnotationQueueItemRepository extends EffectService<
  AnnotationQueueItemRepository,
  AnnotationQueueItemRepositoryShape
>()("@domain/annotation-queues/AnnotationQueueItemRepository") {}
