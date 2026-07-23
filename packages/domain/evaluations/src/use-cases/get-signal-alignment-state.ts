import { type WorkflowDescription, WorkflowQuerier } from "@domain/queue"
import type { ProjectId, RepositoryError, SignalId } from "@domain/shared"
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
 * - `failed` — the single most recently *closed* generation or realignment
 *   workflow across the whole issue ended in failure; `reason` is its resolved
 *   message, or `null` once Temporal has dropped the run. A later successful
 *   workflow supersedes an older failure, so a stale failure is never shown.
 */
export type SignalAlignmentState =
  | { readonly kind: "automatic" }
  | { readonly kind: "idle" }
  | { readonly kind: "generating" }
  | { readonly kind: "realigning"; readonly evaluationId: string }
  | {
      readonly kind: "failed"
      readonly phase: "generate" | "realign"
      readonly evaluationId?: string
      readonly reason: string | null
    }

const buildGenerateWorkflowId = (signalId: string) => `evaluations:generate:${signalId}`
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
export const deriveSignalAlignmentState = (input: {
  readonly signalId: SignalId
  readonly activeEvaluations: readonly Evaluation[]
  readonly isAutomaticallyMonitored?: boolean
}): Effect.Effect<SignalAlignmentState, never, WorkflowQuerier> =>
  Effect.gen(function* () {
    if (input.isAutomaticallyMonitored && input.activeEvaluations.length === 0) {
      return { kind: "automatic" } satisfies SignalAlignmentState
    }

    const workflowQuerier = yield* WorkflowQuerier

    const generation = yield* workflowQuerier.describe(buildGenerateWorkflowId(input.signalId))
    if (generation?.status === "running") {
      return { kind: "generating" } satisfies SignalAlignmentState
    }

    type TerminalCandidate = {
      readonly description: WorkflowDescription
      readonly phase: "generate" | "realign"
      readonly evaluationId?: string
    }
    const closedWorkflows: TerminalCandidate[] = []

    // Generation failure only matters before the first evaluation exists; once
    // an evaluation is present, generation has already succeeded and any prior
    // generation failure is stale.
    if (generation !== null && generation.closeTime !== null && input.activeEvaluations.length === 0) {
      closedWorkflows.push({ description: generation, phase: "generate" })
    }

    for (const evaluation of input.activeEvaluations) {
      const [refresh, optimize] = yield* Effect.all(
        [
          workflowQuerier.describe(buildRefreshAlignmentWorkflowId(evaluation.id)),
          workflowQuerier.describe(buildOptimizeWorkflowId(evaluation.id)),
        ],
        { concurrency: 2 },
      )
      if (refresh?.status === "running" || optimize?.status === "running") {
        return { kind: "realigning", evaluationId: evaluation.id } satisfies SignalAlignmentState
      }
      for (const description of [refresh, optimize]) {
        if (description !== null && description.closeTime !== null) {
          closedWorkflows.push({ description, phase: "realign", evaluationId: evaluation.id })
        }
      }
    }

    // Only surface a failure when the single most recently closed workflow —
    // generate or realign, across every evaluation — is the one that failed. A
    // later successful (or otherwise non-failed) close supersedes it.
    const latest = closedWorkflows.reduce<TerminalCandidate | null>((newest, candidate) => {
      if (newest === null) return candidate
      // closeTime is non-null for every candidate (filtered above).
      return candidate.description.closeTime! > newest.description.closeTime! ? candidate : newest
    }, null)

    if (latest !== null && latest.description.status === "failed") {
      return {
        kind: "failed",
        phase: latest.phase,
        ...(latest.evaluationId !== undefined ? { evaluationId: latest.evaluationId } : {}),
        reason: latest.description.failure,
      } satisfies SignalAlignmentState
    }

    return { kind: "idle" } satisfies SignalAlignmentState
  })

export interface GetSignalAlignmentStateInput {
  readonly projectId: ProjectId
  readonly signalId: SignalId
  readonly isAutomaticallyMonitored?: boolean
}

export type GetSignalAlignmentStateError = RepositoryError

/**
 * Loads the issue's active evaluations and derives the current alignment
 * state. Use this from callers that don't already have the evaluations
 * loaded (e.g. the web fn powering the issue drawer); aggregating use-cases
 * that already hold the evaluations should call `deriveSignalAlignmentState`
 * directly.
 */
export const getSignalAlignmentStateUseCase = Effect.fn("evaluations.getSignalAlignmentState")(function* (
  input: GetSignalAlignmentStateInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("signalId", input.signalId)

  const evaluationRepository = yield* EvaluationRepository
  const activeEvaluations = yield* evaluationRepository
    .listBySignalId({ projectId: input.projectId, signalId: input.signalId, options: { lifecycle: "active" } })
    .pipe(Effect.map((page) => page.items.filter(isActiveEvaluation)))

  return yield* deriveSignalAlignmentState({
    signalId: input.signalId,
    activeEvaluations,
    ...(input.isAutomaticallyMonitored !== undefined
      ? { isAutomaticallyMonitored: input.isAutomaticallyMonitored }
      : {}),
  })
})
