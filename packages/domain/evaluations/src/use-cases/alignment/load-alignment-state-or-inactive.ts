import { EvaluationId, IssueId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { LoadedEvaluationAlignmentState } from "../../alignment/types.ts"
import { isArchivedEvaluation, isDeletedEvaluation } from "../../helpers.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

export type LoadAlignmentStateOrInactiveResult =
  | { readonly status: "active"; readonly state: LoadedEvaluationAlignmentState }
  | { readonly status: "inactive" }

// Like `loadAlignmentStateUseCase`, but returns a discriminated result instead
// of failing when the evaluation is missing, archived, deleted, or does not
// match the requested issue/project. Used by the rate-limited auto-alignment
// workflows so they can exit cleanly when a delayed job fires for an evaluation
// that has since become inactive (BullMQ has no cancellation primitive).
export const loadAlignmentStateOrInactiveUseCase = Effect.fn("evaluations.loadAlignmentStateOrInactive")(
  function* (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly evaluationId: string
  }) {
    yield* Effect.annotateCurrentSpan("evaluation.id", input.evaluationId)
    yield* Effect.annotateCurrentSpan("evaluation.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("evaluation.issueId", input.issueId)

    const evaluationRepository = yield* EvaluationRepository
    const issueRepository = yield* EvaluationIssueRepository
    const evaluation = yield* evaluationRepository
      .findById(EvaluationId(input.evaluationId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (evaluation === null) {
      return { status: "inactive" } as LoadAlignmentStateOrInactiveResult
    }

    if (isDeletedEvaluation(evaluation) || isArchivedEvaluation(evaluation)) {
      return { status: "inactive" } as LoadAlignmentStateOrInactiveResult
    }

    if (evaluation.projectId !== ProjectId(input.projectId) || evaluation.issueId !== IssueId(input.issueId)) {
      return { status: "inactive" } as LoadAlignmentStateOrInactiveResult
    }

    const issue = yield* issueRepository.findById(IssueId(input.issueId))

    return {
      status: "active",
      state: {
        evaluationId: evaluation.id,
        issueId: evaluation.issueId,
        issueName: issue.name,
        issueDescription: issue.description,
        name: evaluation.name,
        description: evaluation.description,
        alignedAt: evaluation.alignedAt.toISOString(),
        draft: {
          script: evaluation.script,
          evaluationHash: evaluation.alignment.evaluationHash,
          trigger: evaluation.trigger,
        },
        confusionMatrix: evaluation.alignment.confusionMatrix,
      },
    } satisfies LoadAlignmentStateOrInactiveResult
  },
)
