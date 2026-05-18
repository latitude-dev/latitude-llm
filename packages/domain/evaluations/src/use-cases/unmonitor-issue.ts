import type { IssueId, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"

export interface UnmonitorIssueInput {
  readonly projectId: ProjectId
  readonly issueId: IssueId
}

export type UnmonitorIssueError = RepositoryError

/**
 * Stops monitoring an issue by soft-deleting every active evaluation linked
 * to it. Idempotent — issues with no active evaluations succeed silently.
 *
 * The web's per-evaluation `softDeleteIssueEvaluation` server fn operates at
 * a finer granularity (one evaluation row at a time) and is intentionally
 * left in place; this use-case is the issue-level API surface.
 */
export const unmonitorIssueUseCase = Effect.fn("evaluations.unmonitorIssue")(function* (input: UnmonitorIssueInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("issueId", input.issueId)

  const repo = yield* EvaluationRepository
  yield* repo.softDeleteByIssueId({ projectId: input.projectId, issueId: input.issueId })
})
