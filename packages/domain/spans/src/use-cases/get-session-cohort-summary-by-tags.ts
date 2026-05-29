import { CacheStore, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { buildMetricBaselines, type CohortSummary } from "../cohort-baselines.ts"
import { COHORT_SUMMARY_CACHE_TTL_SECONDS } from "../constants.ts"
import { SessionRepository } from "../ports/session-repository.ts"

export interface GetSessionCohortSummaryByTagsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly tags: ReadonlyArray<string>
}

const buildCacheKey = (organizationId: string, projectId: string, sortedTags: readonly string[]): string =>
  // JSON-encode the tags array so delimiters inside tag values can't collide with the key structure.
  `org:${organizationId}:projects:${projectId}:session-cohort-baselines:${JSON.stringify(sortedTags)}`

const parseCachedSummary = (json: string): CohortSummary | null => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (
      parsed &&
      typeof parsed === "object" &&
      "count" in parsed &&
      typeof (parsed as { count: unknown }).count === "number" &&
      "baselines" in parsed &&
      typeof (parsed as { baselines: unknown }).baselines === "object" &&
      (parsed as { baselines: unknown }).baselines !== null
    ) {
      return parsed as CohortSummary
    }
    return null
  } catch {
    return null
  }
}

export const getSessionCohortSummaryByTagsUseCase = Effect.fn("spans.getSessionCohortSummaryByTags")(function* (
  input: GetSessionCohortSummaryByTagsInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("tagsLength", input.tags.length)

  // Canonicalize as a sorted set: dedupe first (ClickHouse stores `tags` as
  // `groupUniqArrayArray(tags)`, which is already deduped — passing duplicates
  // through would break the `length(tags) = N` exact-set match and also split
  // the cache key from the canonical cohort). Then sort for stable, order-
  // independent cache keys and query params.
  const sortedTags = [...new Set(input.tags)].sort()
  const cache = yield* CacheStore
  const cacheKey = buildCacheKey(input.organizationId, input.projectId, sortedTags)

  const cachedJson = yield* cache.get(cacheKey).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (cachedJson !== null) {
    const parsed = parseCachedSummary(cachedJson)
    if (parsed !== null) {
      yield* Effect.annotateCurrentSpan("cache.hit", true)
      return parsed
    }
  }
  yield* Effect.annotateCurrentSpan("cache.hit", false)

  const sessionRepository = yield* SessionRepository
  const baselineData = yield* sessionRepository.getCohortBaselineByTags({
    organizationId: input.organizationId,
    projectId: input.projectId,
    tags: sortedTags,
  })
  const baselines = buildMetricBaselines(baselineData)
  const summary: CohortSummary = {
    count: baselineData.count,
    baselines,
  }

  // Fire-and-forget cache write — do not fail the request on cache errors.
  yield* cache
    .set(cacheKey, JSON.stringify(summary), { ttlSeconds: COHORT_SUMMARY_CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))

  return summary
})
