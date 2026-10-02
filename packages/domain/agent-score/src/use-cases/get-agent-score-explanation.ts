import { CacheStore, type OrganizationId, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreResult } from "../entities/agent-score.ts"
import {
  AGENT_SCORE_EXPLANATION_TTL_SECONDS,
  type AgentScoreExplanation,
  agentScoreExplanationCacheKey,
  agentScoreExplanationSchema,
  latestAgentScoreExplanationCacheKey,
  toAgentScoreExplanation,
} from "../entities/agent-score-explanation.ts"
import { AgentScoreSnapshotRepository } from "../ports/agent-score-snapshot-repository.ts"

export type AgentScoreExplanationResult =
  | { readonly status: "ready"; readonly explanation: AgentScoreExplanation }
  /** No cached explanation and none computed: the page says so rather than showing an empty table. */
  | { readonly status: "notComputed" }

/**
 * The latest pointer only moves forward.
 *
 * Refresh can enqueue a forced recompute for an older snapshot date beside
 * today's run, and queue jobs finish out of order. An older backfill must not
 * reclobber the pointer once a newer explanation has landed. Dates are
 * `YYYY-MM-DD`, so a plain string comparison orders them.
 */
export const shouldAdvanceLatestExplanation = ({
  existingDate,
  incomingDate,
}: {
  readonly existingDate: string | null
  readonly incomingDate: string
}): boolean => existingDate === null || incomingDate >= existingDate

const readLatestExplanationDate = (cached: string | null): string | null => {
  if (!cached) return null
  try {
    const parsed = JSON.parse(cached) as { readonly date?: unknown }
    return typeof parsed.date === "string" ? parsed.date : null
  } catch {
    return null
  }
}

/**
 * Stores an explanation the caller already has.
 *
 * The daily job calls this straight after writing the snapshot, because it has just done the work
 * this cache exists to avoid repeating: a window read, five estimators and an attribution pass. A
 * failed write is logged and swallowed by the caller rather than failing the job, since a missing
 * cache entry costs a page a recomputation and a missing snapshot costs a day of history.
 */
export const cacheAgentScoreExplanation = Effect.fn("agentScore.cacheExplanation")(function* (input: {
  readonly result: AgentScoreResult
  readonly date: string
}) {
  const explanation = toAgentScoreExplanation(input)
  if (!explanation) return false

  const cache = yield* CacheStore
  yield* cache.set(
    agentScoreExplanationCacheKey({
      organizationId: input.result.organizationId,
      projectId: input.result.projectId,
      date: input.date,
    }),
    JSON.stringify(explanation),
    { ttlSeconds: AGENT_SCORE_EXPLANATION_TTL_SECONDS },
  )
  if (explanation.publication.status === "published") {
    const existing = yield* cache
      .get(
        latestAgentScoreExplanationCacheKey({
          organizationId: input.result.organizationId,
          projectId: input.result.projectId,
        }),
      )
      .pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
    if (
      shouldAdvanceLatestExplanation({ existingDate: readLatestExplanationDate(existing), incomingDate: input.date })
    ) {
      yield* cache.set(
        latestAgentScoreExplanationCacheKey({
          organizationId: input.result.organizationId,
          projectId: input.result.projectId,
        }),
        JSON.stringify(explanation),
      )
    }
  }
  return true
})

const readAgentScoreExplanation = (key: string) =>
  Effect.gen(function* () {
    const cache = yield* CacheStore
    // A cache that cannot be read is a cache miss, never a failed page.
    const cached = yield* cache.get(key).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))

    if (!cached) return { status: "notComputed" } satisfies AgentScoreExplanationResult

    // A shape this build no longer understands is stale, not fatal: the next daily run replaces it.
    // Validated rather than cast, because the page dereferences every branch of it and an entry
    // written by an older build would break the page instead of reading as a miss.
    const parsed = yield* Effect.try({
      try: () => agentScoreExplanationSchema.safeParse(JSON.parse(cached)),
      catch: () => null,
    }).pipe(Effect.orElseSucceed(() => null))

    return (
      parsed?.success ? { status: "ready", explanation: parsed.data } : { status: "notComputed" }
    ) satisfies AgentScoreExplanationResult
  })

export const getAgentScoreExplanation = Effect.fn("agentScore.getExplanation")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly date: string
}) {
  const snapshots = yield* AgentScoreSnapshotRepository
  const snapshot = yield* snapshots.findByDate(input)
  if (snapshot?.explanation)
    return { status: "ready", explanation: snapshot.explanation } satisfies AgentScoreExplanationResult
  const dated = yield* readAgentScoreExplanation(agentScoreExplanationCacheKey(input))
  const result = dated.status === "ready" ? dated : yield* getLatestAgentScoreExplanation(input)
  if (result.status !== "ready") return result
  const explanation = result.explanation
  if (
    explanation.organizationId !== input.organizationId ||
    explanation.projectId !== input.projectId ||
    explanation.date !== input.date ||
    (snapshot && explanation.scoringVersion !== snapshot.scoringVersion)
  )
    return { status: "notComputed" } satisfies AgentScoreExplanationResult
  return result
})

// TODO: remove once every pre-split entry has aged out; they were written with a 26-hour TTL.
const legacyAgentScoreExplanationCacheKey = ({
  organizationId,
  projectId,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}): string => `org:${organizationId}:agent-score:explanation:${projectId}`

export const getLatestAgentScoreExplanation = Effect.fn("agentScore.getLatestExplanation")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}) {
  const latest = yield* readAgentScoreExplanation(latestAgentScoreExplanationCacheKey(input))
  if (latest.status === "ready") return latest

  return yield* readAgentScoreExplanation(legacyAgentScoreExplanationCacheKey(input))
})
