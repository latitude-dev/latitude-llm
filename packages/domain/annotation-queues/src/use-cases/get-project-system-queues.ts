import { CacheStore, type ProjectId } from "@domain/shared"
import { safeParseJson } from "@repo/utils"
import { Effect, Option, Schema } from "effect"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"

export interface SystemQueueCacheEntry {
  readonly queueSlug: string
  readonly sampling: number
}

export const CACHE_TTL_SECONDS = 300

const buildProjectSystemQueuesCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:projects:${projectId}:system-queues`

const systemQueueCacheEntrySchema = Schema.Struct({
  queueSlug: Schema.String,
  sampling: Schema.Number,
})
const systemQueueCacheEntriesSchema = Schema.Array(systemQueueCacheEntrySchema)
const systemQueueCacheEntriesFromJsonStringSchema = Schema.fromJsonString(systemQueueCacheEntriesSchema)

const toCacheEntry = (queue: { slug: string; settings: { sampling?: number | undefined } }): SystemQueueCacheEntry => ({
  queueSlug: queue.slug,
  sampling: queue.settings.sampling ?? 0,
})

const parseCacheEntries = (json: string): SystemQueueCacheEntry[] | null => {
  try {
    return [...Schema.decodeUnknownSync(systemQueueCacheEntriesSchema)(safeParseJson(json))]
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

export interface EvictProjectSystemQueuesInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export const getProjectSystemQueuesUseCase = Effect.fn("annotationQueues.getProjectSystemQueues")(function* (
  input: GetProjectSystemQueuesInput,
) {
  yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)

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

export const evictProjectSystemQueuesUseCase = (input: EvictProjectSystemQueuesInput) =>
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
    Effect.withSpan("annotationQueues.evictProjectSystemQueues"),
  )
