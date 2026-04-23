import { CacheStore, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TraceRepository } from "../ports/trace-repository.ts"
import { buildTraceMetricBaselines, type TraceCohortSummary } from "../trace-cohorts.ts"

export interface GetTraceCohortSummaryByTagsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly tags: ReadonlyArray<string>
}

const TRACE_COHORT_SUMMARY_CACHE_TTL_SECONDS = 300

const buildCacheKey = (organizationId: string, projectId: string, sortedTags: readonly string[]): string =>
  // JSON-encode the tags array so delimiters inside tag values can't collide with the key structure.
  `org:${organizationId}:projects:${projectId}:cohort-baselines:${JSON.stringify(sortedTags)}`

const parseCachedSummary = (json: string): TraceCohortSummary | null => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (
      parsed &&
      typeof parsed === "object" &&
      "traceCount" in parsed &&
      typeof (parsed as { traceCount: unknown }).traceCount === "number" &&
      "baselines" in parsed &&
      typeof (parsed as { baselines: unknown }).baselines === "object" &&
      (parsed as { baselines: unknown }).baselines !== null
    ) {
      return parsed as TraceCohortSummary
    }
    return null
  } catch {
    return null
  }
}

export const getTraceCohortSummaryByTagsUseCase = Effect.fn("spans.getTraceCohortSummaryByTags")(function* (
  input: GetTraceCohortSummaryByTagsInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("tagsLength", input.tags.length)

  // Sort tags for a stable, order-independent cache key (matches the CH repo's
  // own sort so cache hits align with query-shape).
  const sortedTags = [...input.tags].sort()
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

  const traceRepository = yield* TraceRepository
  const baselineData = yield* traceRepository.getCohortBaselineByTags({
    organizationId: input.organizationId,
    projectId: input.projectId,
    tags: sortedTags,
  })
  const baselines = buildTraceMetricBaselines(baselineData)
  const summary: TraceCohortSummary = {
    traceCount: baselineData.traceCount,
    baselines,
  }

  // Fire-and-forget cache write — do not fail the request on cache errors.
  yield* cache
    .set(cacheKey, JSON.stringify(summary), { ttlSeconds: TRACE_COHORT_SUMMARY_CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))

  return summary
})
