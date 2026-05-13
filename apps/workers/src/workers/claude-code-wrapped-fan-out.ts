import { AdminFeatureFlagRepository } from "@domain/admin"
import { CLAUDE_CODE_WRAPPED_FLAG } from "@domain/feature-flags"
import { listProjectsWithClaudeCodeSpansUseCase } from "@domain/spans"
import { Effect } from "effect"

/**
 * Concurrency cap for the per-project publish fan-out. Matches the
 * `Effect.forEach` cap that lived inline in the worker before extraction.
 */
const PUBLISH_CONCURRENCY = 10

/**
 * Callback the use case invokes for each surviving `(orgId, projectId)`. The
 * worker wires this to `QueuePublisher.publish("claude-code-wrapped",
 * "runForProject", payload)`; tests pass a capture function.
 */
export type FanOutWeeklyRunPublish = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly windowStartIso: string
  readonly windowEndIso: string
}) => Effect.Effect<void, unknown>

interface FanOutWeeklyRunDeps {
  readonly publish: FanOutWeeklyRunPublish
}

interface FanOutWeeklyRunInput {
  readonly windowStart: Date
  readonly windowEnd: Date
}

type FanOutWeeklyRunResult =
  | { readonly status: "no-activity" }
  | { readonly status: "no-eligible-orgs" }
  | { readonly status: "fanned-out"; readonly publishedCount: number }

/**
 * The cron's "decide which projects get a runForProject task" logic, lifted
 * out of the worker so it can be tested with fakes.
 *
 * Pipeline:
 *
 *   1. Ask ClickHouse for projects with at least one Claude Code span in
 *      the window.
 *   2. Ask admin postgres which organizations have the
 *      `claude-code-wrapped` feature flag enabled (or whether it's enabled
 *      globally).
 *   3. Intersect the two — keep only projects whose org is flag-enabled.
 *   4. Publish one task per surviving pair.
 *
 * The publish step is a callback so the use case isn't coupled to the queue
 * adapter — tests substitute a capture function.
 */
export const fanOutWeeklyRunUseCase = (deps: FanOutWeeklyRunDeps) =>
  Effect.fn("claude-code-wrapped.fanOutWeeklyRun")(function* (input: FanOutWeeklyRunInput) {
    const projects = yield* listProjectsWithClaudeCodeSpansUseCase({
      from: input.windowStart,
      to: input.windowEnd,
    })
    if (projects.length === 0) {
      return { status: "no-activity" } satisfies FanOutWeeklyRunResult
    }

    const adminFlags = yield* AdminFeatureFlagRepository
    const eligibility = yield* adminFlags.findEligibilityForFlag(CLAUDE_CODE_WRAPPED_FLAG)

    const enabledOrgIds = new Set(eligibility.organizationIds.map((id) => id as string))
    const eligible = eligibility.enabledForAll
      ? projects
      : projects.filter((project) => enabledOrgIds.has(project.organizationId as string))

    if (eligible.length === 0) {
      return { status: "no-eligible-orgs" } satisfies FanOutWeeklyRunResult
    }

    const windowStartIso = input.windowStart.toISOString()
    const windowEndIso = input.windowEnd.toISOString()

    yield* Effect.forEach(
      eligible,
      (project) =>
        deps.publish({
          organizationId: project.organizationId as string,
          projectId: project.projectId as string,
          windowStartIso,
          windowEndIso,
        }),
      { concurrency: PUBLISH_CONCURRENCY, discard: true },
    )

    return { status: "fanned-out", publishedCount: eligible.length } satisfies FanOutWeeklyRunResult
  })
