import { CacheStore, type ProjectId } from "@domain/shared"
import { Effect, Option, Schema } from "effect"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface SystemQueueCacheEntry {
  readonly queueSlug: string
  readonly sampling: number
}

export const CACHE_TTL_SECONDS = 300

export const buildProjectSystemQueuesCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:projects:${projectId}:system-queues`

const systemQueueCacheEntrySchema = Schema.Struct({
  queueSlug: Schema.String,
  sampling: Schema.Number,
})
const systemQueueCacheEntriesFromJsonStringSchema = Schema.fromJsonString(Schema.Array(systemQueueCacheEntrySchema))

const toCacheEntry = (queue: { slug: string; settings: { sampling?: number | undefined } }): SystemQueueCacheEntry => ({
  queueSlug: queue.slug,
  sampling: queue.settings.sampling ?? 0,
})

const parseCacheEntries = (json: string): SystemQueueCacheEntry[] | null => {
  try {
    return [...Schema.decodeUnknownSync(systemQueueCacheEntriesFromJsonStringSchema)(json)]
  } catch {
    return null
  }
}

const encodeCacheEntries = (entries: readonly SystemQueueCacheEntry[]) =>
  Schema.encodeSync(systemQueueCacheEntriesFromJsonStringSchema)(entries)

export interface GetProjectSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export const getProjectSystemQueuesUseCase = (input: GetProjectSystemQueuesInput) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    const cacheKey = buildProjectSystemQueuesCacheKey(input.organizationId, input.projectId)

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
      .set(cacheKey, encodeCacheEntries(entries), { ttlSeconds: CACHE_TTL_SECONDS })
      .pipe(Effect.catchTag("CacheError", () => Effect.void))

    return entries
  })

export const evictProjectSystemQueuesUseCase = (input: {
  readonly organizationId: string
  readonly projectId: ProjectId
}) =>
  Effect.serviceOption(CacheStore).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (cache) => {
          const cacheKey = buildProjectSystemQueuesCacheKey(input.organizationId, input.projectId)
          return cache.delete(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.void))
        },
      }),
    ),
  )
