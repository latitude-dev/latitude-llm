import { CacheStore, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

/**
 * Cache entry for a system queue - minimal data for routing decisions.
 */
export interface SystemQueueCacheEntry {
  readonly queueSlug: string
  readonly sampling: number
}

/**
 * TTL for cache entries in seconds (5 minutes).
 */
export const CACHE_TTL_SECONDS = 300

/**
 * Cache key builder for project system queue snapshots.
 * Follows org namespace convention: org:${organizationId}:projects:${projectId}:system-queues
 */
const buildCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:projects:${projectId}:system-queues`

/**
 * Convert an AnnotationQueue to its minimal cache representation.
 */
const toCacheEntry = (queue: { slug: string; settings: { sampling?: number | undefined } }): SystemQueueCacheEntry => ({
  queueSlug: queue.slug,
  sampling: queue.settings.sampling ?? 0,
})

/**
 * Parse cache entries from JSON string.
 * Returns null if parsing fails.
 */
const parseCacheEntries = (json: string): SystemQueueCacheEntry[] | null => {
  try {
    return JSON.parse(json) as SystemQueueCacheEntry[]
  } catch {
    return null
  }
}

export interface GetProjectSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

/**
 * Get the project system queue snapshot from cache or hydrate from DB.
 * Read-through cache: on miss, queries Postgres, writes to cache, then returns.
 *
 * Cache failures are treated as misses.
 * DB failures propagate as errors.
 *
 * @param input - Organization and project identifiers
 * @returns Effect that resolves to array of system queue cache entries
 */
export const getProjectSystemQueuesUseCase = (input: GetProjectSystemQueuesInput) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    const cacheKey = buildCacheKey(input.organizationId, input.projectId)

    const cached = yield* cache.get(cacheKey)

    if (cached !== null) {
      const parsed = parseCacheEntries(cached)
      if (parsed !== null) {
        return parsed
      }
    }

    const repo = yield* AnnotationQueueRepository
    const queues = yield* repo.listSystemQueuesByProject({ projectId: input.projectId })
    const entries = queues.map(toCacheEntry)

    yield* cache.set(cacheKey, JSON.stringify(entries), { ttlSeconds: CACHE_TTL_SECONDS })

    return entries
  })

export interface EvictProjectSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

/**
 * Evict the project system queue snapshot from cache.
 * Should be called whenever a system queue is updated.
 *
 * @param input - Organization and project identifiers
 * @returns Effect that completes when eviction is done
 */
export const evictProjectSystemQueuesUseCase = (input: EvictProjectSystemQueuesInput) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    const cacheKey = buildCacheKey(input.organizationId, input.projectId)

    yield* cache.delete(cacheKey)
  })
