import type { ProjectId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"

/**
 * Keyset cursor for queue list pagination. `sortValue` encoding depends on {@link AnnotationQueueListSortBy}:
 * - `createdAt`: ISO 8601 `created_at`
 * - `name`: queue `name` (lexicographic per DB collation)
 * - `completedItems`: decimal string of `completed_items`
 * - `pendingItems`: decimal string of `(total_items - completed_items)`
 *
 * `id` is the queue id tie-breaker (stable order with the active sort).
 */
export interface AnnotationQueueListCursor {
  readonly sortValue: string
  readonly id: string
}

export type AnnotationQueueListSortBy = "createdAt" | "name" | "completedItems" | "pendingItems"

export interface AnnotationQueueListOptions {
  readonly limit?: number
  readonly cursor?: AnnotationQueueListCursor
  readonly sortBy?: AnnotationQueueListSortBy
  readonly sortDirection?: "asc" | "desc"
}

export interface AnnotationQueueListPage {
  readonly items: readonly AnnotationQueue[]
  readonly hasMore: boolean
  readonly nextCursor?: AnnotationQueueListCursor
}

export interface ListAnnotationQueuesInput {
  readonly projectId: ProjectId
  readonly options: AnnotationQueueListOptions
}

export interface AnnotationQueueRepositoryShape {
  listByProject(input: ListAnnotationQueuesInput): Effect.Effect<AnnotationQueueListPage, RepositoryError>
  findByIdInProject(input: {
    projectId: ProjectId
    queueId: string
  }): Effect.Effect<AnnotationQueue | null, RepositoryError>
}

export class AnnotationQueueRepository extends ServiceMap.Service<
  AnnotationQueueRepository,
  AnnotationQueueRepositoryShape
>()("@domain/annotation-queues/AnnotationQueueRepository") {}
