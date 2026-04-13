import { BadRequestError, EvaluationId, generateId, IssueId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { PersistEvaluationAlignmentResult } from "../../alignment/types.ts"
import {
  type ConfusionMatrix,
  type EvaluationTrigger,
  evaluationSchema,
} from "../../entities/evaluation.ts"
import { isDeletedEvaluation } from "../../helpers.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

export const persistAlignmentResultUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId?: string | null
  readonly script: string
  readonly evaluationHash: string
  readonly confusionMatrix: ConfusionMatrix
  readonly trigger: EvaluationTrigger
  readonly name: string
  readonly description: string
}) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const projectId = ProjectId(input.projectId)
    const issueId = IssueId(input.issueId)
    const existingEvaluation = input.evaluationId
      ? yield* evaluationRepository
          .findById(EvaluationId(input.evaluationId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      : null

    if (input.evaluationId && existingEvaluation === null) {
      return yield* new BadRequestError({
        message: `Evaluation ${input.evaluationId} was not found for alignment`,
      })
    }

    if (existingEvaluation && isDeletedEvaluation(existingEvaluation)) {
      return yield* new BadRequestError({
        message: `Deleted evaluation ${existingEvaluation.id} cannot be realigned`,
      })
    }

    if (existingEvaluation && (existingEvaluation.projectId !== projectId || existingEvaluation.issueId !== issueId)) {
      return yield* new BadRequestError({
        message: `Evaluation ${existingEvaluation.id} does not match the requested issue or project`,
      })
    }

    const now = new Date()
    const evaluation = evaluationSchema.parse({
      id: existingEvaluation?.id ?? input.evaluationId ?? generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      name: existingEvaluation?.name ?? input.name,
      description: existingEvaluation?.description ?? input.description,
      script: input.script,
      trigger: input.trigger,
      alignment: {
        evaluationHash: input.evaluationHash,
        confusionMatrix: input.confusionMatrix,
      },
      alignedAt: now,
      archivedAt: existingEvaluation?.archivedAt ?? null,
      deletedAt: existingEvaluation?.deletedAt ?? null,
      createdAt: existingEvaluation?.createdAt ?? now,
      updatedAt: now,
    })

    yield* evaluationRepository.save(evaluation)

    return { evaluationId: evaluation.id } satisfies PersistEvaluationAlignmentResult
  })
