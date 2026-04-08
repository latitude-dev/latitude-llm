import type { RedisClient } from "@platform/cache-redis"
import { Effect } from "effect"

/**
 * Default TTL for progress tracking keys (24 hours).
 * Progress data is transient - once a job completes, we don't need the tracking data.
 */
const DEFAULT_PROGRESS_TTL_SECONDS = 24 * 60 * 60

/**
 * Creates a Redis-backed progress tracker for idempotent iteration processing.
 *
 * This abstraction ensures that individual iterations or work items within a background job
 * are processed exactly once, even if the job is retried due to partial failures.
 *
 * Use case: When a worker processes a batch of items (e.g., traces, documents, workflow items),
 * it can track which specific items have been completed. If the job fails
 * midway and restarts, already-completed items can be skipped.
 *
 * The tracker uses Redis sets for O(1) membership checks and atomic multi/exec
 * operations to prevent race conditions when marking items complete.
 *
 * Supports both numeric iteration indices (0, 1, 2...) and string identifiers (workflow IDs, etc.).
 *
 * @example
 * ```typescript
 * // With numeric iteration indices
 * const tracker = createIterationProgress({
 *   redisClient,
 *   jobId: `export:${organizationId}:${projectId}:${exportId}`,
 *   ttlSeconds: 3600,
 * })
 *
 * for (let i = 0; i < totalIterations; i++) {
 *   const wasAlreadyDone = yield* tracker.isComplete(i)
 *   if (wasAlreadyDone) continue
 *   // ... process iteration ...
 *   yield* tracker.markComplete(i)
 * }
 *
 * // With string identifiers
 * const tracker = createIterationProgress({
 *   redisClient,
 *   jobId: `workflows:${traceId}`,
 *   ttlSeconds: 3600,
 * })
 *
 * const wasAlreadyDone = yield* tracker.isComplete(workflowId)
 * if (!wasAlreadyDone) {
 *   yield* startWorkflow(workflowId)
 *   yield* tracker.markComplete(workflowId)
 * }
 * ```
 */
export const createIterationProgress = ({
  redisClient,
  jobId,
  ttlSeconds = DEFAULT_PROGRESS_TTL_SECONDS,
}: {
  readonly redisClient: RedisClient
  readonly jobId: string
  readonly ttlSeconds?: number
}) => {
  const progressKey = `job-progress:${jobId}:completed-items`

  /**
   * Check if an item has already been completed.
   * Returns true if the item was previously marked complete.
   */
  const isComplete = (itemId: string | number): Effect.Effect<boolean, never, never> =>
    Effect.gen(function* () {
      const result: number = yield* Effect.promise(() => redisClient.sismember(progressKey, String(itemId)))
      return result === 1
    })

  /**
   * Mark an item as complete.
   * Uses atomic Redis multi/exec to add the item to the set and maintain TTL.
   * Safe to call multiple times (idempotent).
   */
  const markComplete = (itemId: string | number): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        redisClient.multi().sadd(progressKey, String(itemId)).expire(progressKey, ttlSeconds).exec(),
      )
    })

  /**
   * Mark multiple items as complete in a single atomic operation.
   * More efficient than calling markComplete in a loop.
   */
  const markManyComplete = (itemIds: readonly (string | number)[]): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      if (itemIds.length === 0) return

      const multi = redisClient.multi()
      for (const itemId of itemIds) {
        multi.sadd(progressKey, String(itemId))
      }
      multi.expire(progressKey, ttlSeconds)

      yield* Effect.promise(() => multi.exec())
    })

  /**
   * Get the count of completed items.
   */
  const getCompletedCount = (): Effect.Effect<number, never, never> =>
    Effect.gen(function* () {
      const count: number = yield* Effect.promise(() => redisClient.scard(progressKey))
      return count
    })

  /**
   * Get all completed item identifiers as a Set of strings.
   * Use sparingly for large item counts - consumes memory.
   */
  const getCompletedItems = (): Effect.Effect<Set<string>, never, never> =>
    Effect.gen(function* () {
      const members: string[] = yield* Effect.promise(() => redisClient.smembers(progressKey))
      return new Set(members)
    })

  /**
   * Get all completed iteration indices as a Set of numbers.
   * Convenience method that parses string members as integers.
   * Use sparingly for large iteration counts - consumes memory.
   */
  const getCompletedIterations = (): Effect.Effect<Set<number>, never, never> =>
    Effect.gen(function* () {
      const members: string[] = yield* Effect.promise(() => redisClient.smembers(progressKey))
      return new Set(members.map((m: string) => Number.parseInt(m, 10)))
    })

  /**
   * Clear all progress for this job.
   * Call after successful job completion to clean up Redis.
   */
  const clear = (): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      yield* Effect.promise(() => redisClient.del(progressKey))
    })

  return {
    isComplete,
    markComplete,
    markManyComplete,
    getCompletedCount,
    getCompletedItems,
    getCompletedIterations,
    clear,
  }
}
