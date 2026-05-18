import { WorkflowQuerier } from "@domain/queue"
import type { IssueId, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { type Evaluation, isActiveEvaluation } from "../entities/evaluation.ts"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"

/**
 * Real-time alignment state for an issue, derived from running Temporal
 * workflows. Mirrors what the issue drawer's "Generate / Realign now" button
 * needs to decide whether to enable itself.
 *
 * - `automatic` — the issue is monitored by an upstream system (e.g. a
 *   flagger) and no LLM evaluation is needed yet. Surfaced when the caller
 *   passes `isAutomaticallyMonitored: true` AND no active evaluation exists.
 * - `idle` — no generation or realignment is in flight.
 * - `generating` — the per-issue generation workflow is running (the issue
 *   has no active evaluation yet).
 * - `realigning` — a refresh-alignment or full-reoptimization workflow is
 *   running for one of the issue's active evaluations.
 */
export type IssueAlignmentState =
  | { readonly kind: "automatic" }
  | { readonly kind: "idle" }
  | { readonly kind: "generating" }
  | { readonly kind: "realigning"; readonly evaluationId: string }

const buildGenerateWorkflowId = (issueId: string) => `evaluations:generate:${issueId}`
const buildOptimizeWorkflowId = (evaluationId: string) => `evaluations:optimize:${evaluationId}`
const buildRefreshAlignmentWorkflowId = (evaluationId: string) => `evaluations:refreshAlignment:${evaluationId}`

/**
 * Lower-level helper: derives the alignment state from a pre-loaded set of
 * active evaluations. Useful inside aggregating use-cases (e.g. issue detail)
 * that already have the evaluations in hand and want to avoid re-fetching.
 *
 * When `isAutomaticallyMonitored` is `true` (e.g. the issue was discovered by
 * a flagger that keeps re-evaluating it upstream) and no active LLM
 * evaluation exists yet, the state collapses to `{ kind: "automatic" }` —
 * the caller can treat that as "no manual monitoring needed". Once an
 * evaluation exists, the regular generating/realigning/idle states take over
 * so callers can still realign or unmonitor.
 */
export const deriveIssueAlignmentState = (input: {
  readonly issueId: IssueId
  readonly activeEvaluations: readonly Evaluation[]
  readonly isAutomaticallyMonitored?: boolean
}): Effect.Effect<IssueAlignmentState, never, WorkflowQuerier> =>
  Effect.gen(function* () {
    if (input.isAutomaticallyMonitored && input.activeEvaluations.length === 0) {
      return { kind: "automatic" } satisfies IssueAlignmentState
    }

    const workflowQuerier = yield* WorkflowQuerier

    const generation = yield* workflowQuerier.describe(buildGenerateWorkflowId(input.issueId))
    if (generation?.status === "running") {
      return { kind: "generating" } satisfies IssueAlignmentState
    }

    for (const evaluation of input.activeEvaluations) {
      const descriptions = yield* Effect.all(
        [
          workflowQuerier.describe(buildRefreshAlignmentWorkflowId(evaluation.id)),
          workflowQuerier.describe(buildOptimizeWorkflowId(evaluation.id)),
        ],
        { concurrency: 2 },
      )
      if (descriptions.some((description) => description?.status === "running")) {
        return { kind: "realigning", evaluationId: evaluation.id } satisfies IssueAlignmentState
      }
    }

    return { kind: "idle" } satisfies IssueAlignmentState
  })

export interface GetIssueAlignmentStateInput {
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly isAutomaticallyMonitored?: boolean
}

export type GetIssueAlignmentStateError = RepositoryError

/**
 * Loads the issue's active evaluations and derives the current alignment
 * state. Use this from callers that don't already have the evaluations
 * loaded (e.g. the web fn powering the issue drawer); aggregating use-cases
 * that already hold the evaluations should call `deriveIssueAlignmentState`
 * directly.
 */
export const getIssueAlignmentStateUseCase = Effect.fn("evaluations.getIssueAlignmentState")(function* (
  input: GetIssueAlignmentStateInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("issueId", input.issueId)

  const evaluationRepository = yield* EvaluationRepository
  const activeEvaluations = yield* evaluationRepository
    .listByIssueId({ projectId: input.projectId, issueId: input.issueId, options: { lifecycle: "active" } })
    .pipe(Effect.map((page) => page.items.filter(isActiveEvaluation)))

  return yield* deriveIssueAlignmentState({
    issueId: input.issueId,
    activeEvaluations,
    ...(input.isAutomaticallyMonitored !== undefined
      ? { isAutomaticallyMonitored: input.isAutomaticallyMonitored }
      : {}),
  })
})
