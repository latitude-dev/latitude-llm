import { CacheStore, type ProjectId } from "@domain/shared"
import { safeParseJson } from "@repo/utils"
import { Effect, Option, Schema } from "effect"
import { FlaggerRepository } from "../ports/flagger-repository.ts"

/**
 * Cached projection of a project's flagger config rows. The full domain
 * entity (with audit timestamps) lives in Postgres; this cache keeps only
 * the fields the deterministic-flagger fan-out needs on the hot path.
 */
export interface FlaggerCacheEntry {
  readonly flaggerId: string
  readonly slug: string
  readonly enabled: boolean
  readonly sampling: number
}

export const CACHE_TTL_SECONDS = 300

const buildProjectFlaggersCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:flaggers:${projectId}`

const flaggerCacheEntrySchema = Schema.Struct({
  flaggerId: Schema.String,
  slug: Schema.String,
  enabled: Schema.Boolean,
  sampling: Schema.Number,
})
const flaggerCacheEntriesSchema = Schema.Array(flaggerCacheEntrySchema)
const flaggerCacheEntriesFromJsonStringSchema = Schema.fromJsonString(flaggerCacheEntriesSchema)

const toCacheEntry = (flagger: {
  id: string
  slug: string
  enabled: boolean
  sampling: number
}): FlaggerCacheEntry => ({
  flaggerId: flagger.id,
  slug: flagger.slug,
  enabled: flagger.enabled,
  sampling: flagger.sampling,
})

const parseCacheEntries = (json: string): FlaggerCacheEntry[] | null => {
  try {
    return [...Schema.decodeUnknownSync(flaggerCacheEntriesSchema)(safeParseJson(json))]
  } catch {
    return null
  }
}

const encodeCacheEntries = (entries: readonly FlaggerCacheEntry[]) =>
  Schema.encodeSync(flaggerCacheEntriesFromJsonStringSchema)(entries)

export interface GetProjectFlaggersInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export interface EvictProjectFlaggersInput {
  readonly organizationId: string
  readonly projectId: ProjectId
}

export const getProjectFlaggersUseCase = Effect.fn("flaggers.getProjectFlaggers")(function* (
  input: GetProjectFlaggersInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)

  const cache = yield* CacheStore
  const cacheKey = buildProjectFlaggersCacheKey(input.organizationId, input.projectId)

  const cachedResult = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))

  if (cachedResult !== null) {
    const parsed = parseCacheEntries(cachedResult)
    if (parsed !== null) {
      return parsed
    }
  }

  const repo = yield* FlaggerRepository
  const flaggers = yield* repo.listByProject({ projectId: input.projectId })
  const entries = flaggers.map(toCacheEntry)

  yield* cache
    .set(cacheKey, encodeCacheEntries(entries), { ttlSeconds: CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))

  return entries
})

export const evictProjectFlaggersUseCase = (input: EvictProjectFlaggersInput) =>
  Effect.serviceOption(CacheStore).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (cache) => {
          const cacheKey = buildProjectFlaggersCacheKey(input.organizationId, input.projectId)
          return cache.delete(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.void))
        },
      }),
    ),
    Effect.withSpan("flaggers.evictProjectFlaggers"),
  )
