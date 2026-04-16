import { BadRequestError, EvaluationId, IssueId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { LoadedEvaluationAlignmentState } from "../../alignment/types.ts"
import { isDeletedEvaluation } from "../../helpers.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

export const loadAlignmentStateUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string
}) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("evaluation.id", input.evaluationId)
    yield* Effect.annotateCurrentSpan("evaluation.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("evaluation.issueId", input.issueId)

    const evaluationRepository = yield* EvaluationRepository
    const issueRepository = yield* EvaluationIssueRepository
    const evaluation = yield* evaluationRepository
      .findById(EvaluationId(input.evaluationId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (evaluation === null) {
      return yield* new BadRequestError({
        message: `Evaluation ${input.evaluationId} was not found for alignment`,
      })
    }

    if (isDeletedEvaluation(evaluation)) {
      return yield* new BadRequestError({
        message: `Deleted evaluation ${evaluation.id} cannot be realigned`,
      })
    }

    if (evaluation.projectId !== ProjectId(input.projectId) || evaluation.issueId !== IssueId(input.issueId)) {
      return yield* new BadRequestError({
        message: `Evaluation ${evaluation.id} does not match the requested issue or project`,
      })
    }

    const issue = yield* issueRepository.findById(IssueId(input.issueId))

    return {
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
    } satisfies LoadedEvaluationAlignmentState
  }).pipe(Effect.withSpan("evaluations.loadAlignmentState"))
