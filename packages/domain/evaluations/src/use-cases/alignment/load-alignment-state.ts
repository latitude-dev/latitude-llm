import { BadRequestError, EvaluationId, SignalId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { LoadedEvaluationAlignmentState } from "../../alignment/types.ts"
import { isDeletedEvaluation } from "../../helpers.ts"
import { EvaluationSignalRepository } from "../../ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

export const loadAlignmentStateUseCase = Effect.fn("evaluations.loadAlignmentState")(function* (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string
}) {
  yield* Effect.annotateCurrentSpan("evaluation.id", input.evaluationId)
  yield* Effect.annotateCurrentSpan("evaluation.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("evaluation.signalId", input.signalId)

  const evaluationRepository = yield* EvaluationRepository
  const signalRepository = yield* EvaluationSignalRepository
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

  if (evaluation.projectId !== ProjectId(input.projectId) || evaluation.signalId !== SignalId(input.signalId)) {
    return yield* new BadRequestError({
      message: `Evaluation ${evaluation.id} does not match the requested issue or project`,
    })
  }

  const issue = yield* signalRepository.findById(SignalId(input.signalId))

  return {
    evaluationId: evaluation.id,
    signalId: evaluation.signalId,
    signalName: issue.name,
    signalDescription: issue.description,
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
})
