import { ScoreProjectSweepSource, type ScoreSweepProject } from "@domain/agent-score"
import { Effect } from "effect"

/** Bounded so one sweep cannot flood the queue ahead of everything else waiting on it. */
const PUBLISH_CONCURRENCY = 10

type SnapshotProjectPublish = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly date: string
}) => Effect.Effect<void, unknown>

type SweepResult =
  | { readonly status: "no-eligible-projects" }
  | { readonly status: "fanned-out"; readonly publishedCount: number }

/**
 * Decides which projects get a snapshot task today.
 *
 * The date is resolved once, here, and carried on every payload rather than being derived when each
 * task runs: a fan-out that drains across midnight would otherwise score half the fleet for one day
 * and half for the next, and the two halves would not be comparable.
 *
 * Projects below the session floor are not published to at all. They could not produce a score under
 * any window, so a task for them would read a window, compute five estimators and withhold.
 */
export const fanOutAgentScoreSweep =
  (deps: { readonly publish: SnapshotProjectPublish }) =>
  (input: { readonly date: string; readonly to: Date; readonly maxStepDays: number; readonly sessionFloor: number }) =>
    Effect.gen(function* () {
      const source = yield* ScoreProjectSweepSource
      const projects: readonly ScoreSweepProject[] = yield* source.listProjects({
        to: input.to,
        maxStepDays: input.maxStepDays,
        sessionFloor: input.sessionFloor,
      })
      if (projects.length === 0) return { status: "no-eligible-projects" } satisfies SweepResult

      yield* Effect.forEach(
        projects,
        (project) =>
          deps.publish({
            organizationId: project.organizationId as string,
            projectId: project.projectId as string,
            date: input.date,
          }),
        { concurrency: PUBLISH_CONCURRENCY, discard: true },
      )

      return { status: "fanned-out", publishedCount: projects.length } satisfies SweepResult
    })
