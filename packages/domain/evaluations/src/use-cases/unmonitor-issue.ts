import type { SignalId, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"

export interface UnmonitorSignalInput {
  readonly projectId: ProjectId
  readonly signalId: SignalId
}

export type UnmonitorSignalError = RepositoryError

/**
 * Stops monitoring an issue by soft-deleting every active evaluation linked
 * to it. Idempotent — issues with no active evaluations succeed silently.
 *
 * The web's per-evaluation `softDeleteSignalEvaluation` server fn operates at
 * a finer granularity (one evaluation row at a time) and is intentionally
 * left in place; this use-case is the issue-level API surface.
 */
export const unmonitorSignalUseCase = Effect.fn("evaluations.unmonitorSignal")(function* (input: UnmonitorSignalInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("signalId", input.signalId)

  const repo = yield* EvaluationRepository
  yield* repo.softDeleteBySignalId({ projectId: input.projectId, signalId: input.signalId })
})
