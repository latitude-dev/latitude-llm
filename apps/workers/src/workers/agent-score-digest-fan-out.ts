import { AdminFeatureFlagRepository } from "@domain/admin"
import { AgentScoreDigestSource } from "@domain/agent-score"
import { Effect } from "effect"

/** Bounded so one weekly run cannot flood the queue ahead of everything else waiting on it. */
const PUBLISH_CONCURRENCY = 10

export type AgentScoreDigestPublish = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly windowStart: string
  readonly windowEnd: string
}) => Effect.Effect<void, unknown>

type FanOutResult =
  | { readonly status: "no-eligible-organizations" }
  | { readonly status: "no-scored-projects" }
  | { readonly status: "fanned-out"; readonly publishedCount: number }

/**
 * Decides which projects get a weekly digest task.
 *
 * Two gates, both here rather than in the per-project step, so an ineligible project costs nothing
 * beyond this query: the organisation has the Agent Score flag, and the project published a score
 * inside the window. A flag enabled for all resolves to an absent organisation filter rather than
 * an enumerated fleet.
 *
 * The window is resolved once by the caller and carried on every payload. A run that drained across
 * midnight would otherwise digest half the fleet for one week and half for the next.
 */
export const fanOutAgentScoreDigest =
  (deps: { readonly publish: AgentScoreDigestPublish }) =>
  (input: { readonly windowStart: string; readonly windowEnd: string }) =>
    Effect.gen(function* () {
      const flags = yield* AdminFeatureFlagRepository
      const eligibility = yield* flags.findEligibilityForFlag("agentScore")
      if (!eligibility.enabledForAll && eligibility.organizationIds.length === 0) {
        return { status: "no-eligible-organizations" } satisfies FanOutResult
      }

      const source = yield* AgentScoreDigestSource
      const candidates = yield* source.listProjectsWithPublishedScores({
        from: input.windowStart,
        to: input.windowEnd,
        ...(eligibility.enabledForAll ? {} : { organizationIds: eligibility.organizationIds }),
      })
      if (candidates.length === 0) {
        return { status: "no-scored-projects" } satisfies FanOutResult
      }

      yield* Effect.forEach(
        candidates,
        (candidate) =>
          deps.publish({
            organizationId: candidate.organizationId as string,
            projectId: candidate.projectId as string,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
          }),
        { concurrency: PUBLISH_CONCURRENCY, discard: true },
      )

      return { status: "fanned-out", publishedCount: candidates.length } satisfies FanOutResult
    })
