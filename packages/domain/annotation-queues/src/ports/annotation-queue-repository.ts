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

export interface FindBySlugInput {
  readonly projectId: ProjectId
  readonly queueSlug: string
}

export interface FindSystemQueueBySlugInput {
  readonly projectId: ProjectId
  readonly queueSlug: string
}

export interface ListSystemQueuesInput {
  readonly projectId: ProjectId
}

export interface ListLiveQueuesInput {
  readonly projectId: ProjectId
}

export interface IncrementCompletedItemsInput {
  readonly projectId: ProjectId
  readonly queueId: string
  readonly delta: number
}

export type SaveQueueInput = Omit<AnnotationQueue, "id"> & { id?: string }

export interface AnnotationQueueRepositoryShape {
  listByProject(input: ListAnnotationQueuesInput): Effect.Effect<AnnotationQueueListPage, RepositoryError>
  findByIdInProject(input: {
    projectId: ProjectId
    queueId: string
  }): Effect.Effect<AnnotationQueue | null, RepositoryError>
  findBySlugInProject(input: FindBySlugInput): Effect.Effect<AnnotationQueue | null, RepositoryError>
  listSystemQueuesByProject(input: ListSystemQueuesInput): Effect.Effect<readonly AnnotationQueue[], RepositoryError>
  /**
   * List all non-deleted live queues (queues with `settings.filter` present) for a project.
   */
  listLiveQueuesByProject(input: ListLiveQueuesInput): Effect.Effect<readonly AnnotationQueue[], RepositoryError>
  findSystemQueueBySlugInProject(
    input: FindSystemQueueBySlugInput,
  ): Effect.Effect<AnnotationQueue | null, RepositoryError>
  save(queue: SaveQueueInput): Effect.Effect<AnnotationQueue, RepositoryError>
  /**
   * Insert a queue if no queue with the same (organizationId, projectId, slug, deletedAt)
   * exists. Returns true if inserted, false if a conflict was encountered.
   * This is idempotent and safe for concurrent use.
   */
  insertIfNotExists(queue: AnnotationQueue): Effect.Effect<boolean, RepositoryError>
  /**
   * Atomically increment the totalItems counter for a queue by the given delta (defaults to 1).
   */
  incrementTotalItems(input: {
    projectId: ProjectId
    queueId: string
    delta?: number
  }): Effect.Effect<AnnotationQueue, RepositoryError>
  /**
   * Atomically increment the totalItems counter for multiple queues by 1 each.
   * Uses a single UPDATE statement with WHERE id = ANY(...).
   */
  incrementTotalItemsMany(input: {
    projectId: ProjectId
    queueIds: readonly string[]
  }): Effect.Effect<void, RepositoryError>
  /**
   * Adjust the completedItems counter by delta (positive to increment, negative to decrement).
   * The counter is clamped to prevent going below zero.
   */
  incrementCompletedItems(input: IncrementCompletedItemsInput): Effect.Effect<void, RepositoryError>
}

export class AnnotationQueueRepository extends ServiceMap.Service<
  AnnotationQueueRepository,
  AnnotationQueueRepositoryShape
>()("@domain/annotation-queues/AnnotationQueueRepository") {}
