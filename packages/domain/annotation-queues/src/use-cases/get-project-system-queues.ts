import { CacheStore, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface SystemQueueCacheEntry {
  readonly queueSlug: string
  readonly sampling: number
}

export const CACHE_TTL_SECONDS = 300

const buildCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:projects:${projectId}:system-queues`

const toCacheEntry = (queue: { slug: string; settings: { sampling?: number | undefined } }): SystemQueueCacheEntry => ({
  queueSlug: queue.slug,
  sampling: queue.settings.sampling ?? 0,
})

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

export const getProjectSystemQueuesUseCase = (input: GetProjectSystemQueuesInput) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    const cacheKey = buildCacheKey(input.organizationId, input.projectId)

    const cachedResult = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))

    if (cachedResult !== null) {
      const parsed = parseCacheEntries(cachedResult)
      if (parsed !== null) {
        return parsed
      }
    }

    const repo = yield* AnnotationQueueRepository
    const queues = yield* repo.listSystemQueuesByProject({ projectId: input.projectId })
    const entries = queues.map(toCacheEntry)

    yield* cache
      .set(cacheKey, JSON.stringify(entries), { ttlSeconds: CACHE_TTL_SECONDS })
      .pipe(Effect.catchTag("CacheError", () => Effect.void))

    return entries
  })

export interface EvictProjectSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export const evictProjectSystemQueuesUseCase = (input: EvictProjectSystemQueuesInput) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    const cacheKey = buildCacheKey(input.organizationId, input.projectId)

    yield* cache.delete(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.void))
  })
