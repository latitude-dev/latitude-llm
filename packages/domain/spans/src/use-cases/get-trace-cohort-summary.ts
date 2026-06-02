import { CacheStore, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { buildMetricBaselines, type CohortSummary } from "../cohort-baselines.ts"
import { COHORT_SUMMARY_CACHE_TTL_SECONDS } from "../constants.ts"
import { TraceRepository } from "../ports/trace-repository.ts"

export interface GetTraceCohortSummaryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

const buildCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:projects:${projectId}:trace-cohort-baseline`

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

/**
 * Loads the project-wide cohort baseline used to render outlier badges.
 *
 * The repository's `excludeTraceId` param is intentionally not threaded
 * through: the badge is meant to compare against a stable project-wide
 * reference, so the row being viewed is included in its own baseline. A
 * future "compare this trace to everything else" view could surface the
 * port-level support if needed.
 */
export const getTraceCohortSummaryUseCase = Effect.fn("spans.getTraceCohortSummary")(function* (
  input: GetTraceCohortSummaryInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const cache = yield* CacheStore
  const cacheKey = buildCacheKey(input.organizationId, input.projectId)

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
  const baselineData = yield* traceRepository.getCohortBaseline({
    organizationId: input.organizationId,
    projectId: input.projectId,
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
