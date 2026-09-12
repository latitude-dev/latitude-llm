import { CacheStore, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreResult } from "../entities/agent-score.ts"
import {
  AGENT_SCORE_EXPLANATION_TTL_SECONDS,
  type AgentScoreExplanation,
  agentScoreExplanationCacheKey,
  toAgentScoreExplanation,
} from "../entities/agent-score-explanation.ts"

export type AgentScoreExplanationResult =
  | { readonly status: "ready"; readonly explanation: AgentScoreExplanation }
  /** No cached explanation and none computed: the page says so rather than showing an empty table. */
  | { readonly status: "notComputed" }

/**
 * Stores an explanation the caller already has.
 *
 * The daily job calls this straight after writing the snapshot, because it has just done the work
 * this cache exists to avoid repeating: a window read, five estimators and an attribution pass. A
 * failed write is logged and swallowed by the caller rather than failing the job, since a missing
 * cache entry costs a page a recomputation and a missing snapshot costs a day of history.
 */
export const cacheAgentScoreExplanation = Effect.fn("agentScore.cacheExplanation")(function* (
  result: AgentScoreResult,
) {
  const explanation = toAgentScoreExplanation(result)
  if (!explanation) return false

  const cache = yield* CacheStore
  yield* cache.set(
    agentScoreExplanationCacheKey({ organizationId: result.organizationId, projectId: result.projectId }),
    JSON.stringify(explanation),
    { ttlSeconds: AGENT_SCORE_EXPLANATION_TTL_SECONDS },
  )
  return true
})

/**
 * The project's current cause rows, coverage and native inputs.
 *
 * Served from the cache the daily job warms, because computing it means reading every session in the
 * window with its generation content — daily-job work, not page-load work, and doing it per viewer
 * would multiply it by however many people opened the page.
 *
 * A miss is reported rather than computed here. The page shows its scores from the snapshot and says
 * the explanation is still being prepared, which is honest and instant; a request that blocked for
 * the length of a window read would look like the page was broken.
 */
export const getAgentScoreExplanation = Effect.fn("agentScore.getExplanation")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}) {
  const cache = yield* CacheStore
  // A cache that cannot be read is a cache miss, never a failed page.
  const cached = yield* cache
    .get(agentScoreExplanationCacheKey(input))
    .pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))

  if (!cached) return { status: "notComputed" } satisfies AgentScoreExplanationResult

  // A shape this build no longer understands is stale, not fatal: the next daily run replaces it.
  const parsed = yield* Effect.try({
    try: () => JSON.parse(cached) as AgentScoreExplanation,
    catch: () => null,
  }).pipe(Effect.orElseSucceed(() => null))

  return (
    parsed ? { status: "ready", explanation: parsed } : { status: "notComputed" }
  ) satisfies AgentScoreExplanationResult
})
