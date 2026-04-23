import { type QueuePublishError, QueuePublisher, WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, isValidId, type RepositoryError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"

export interface ApproveSystemAnnotationInput {
  readonly scoreId: ScoreId
  readonly comment?: string
}

export type ApproveSystemAnnotationError = RepositoryError | BadRequestError | QueuePublishError

export type ApproveSystemAnnotationResult =
  | { readonly action: "already-published" }
  | { readonly action: "approved"; readonly scoreId: ScoreId }

const startPublishAnnotationWorkflow = (
  workflowStarter: WorkflowStarterShape,
  input: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: ScoreId
    readonly preEnrichedFeedback: string
  },
) =>
  workflowStarter.start(
    "publishAnnotationWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      preEnrichedFeedback: input.preEnrichedFeedback,
    },
    {
      workflowId: `annotations:approve:${input.scoreId}`,
    },
  )

export const approveSystemAnnotationUseCase = Effect.fn("annotations.approveSystemAnnotation")(function* (
  input: ApproveSystemAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.scoreId", input.scoreId)
  const workflowStarter = yield* WorkflowStarter
  const queuePublisher = yield* QueuePublisher
  const scoreRepository = yield* ScoreRepository
  const score = yield* scoreRepository
    .findById(input.scoreId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new BadRequestError({ message: `Annotation ${input.scoreId} not found` })),
      ),
    )

  if (score.draftedAt === null) {
    return { action: "already-published" } satisfies ApproveSystemAnnotationResult
  }

  if (score.source !== "annotation") {
    return yield* new BadRequestError({
      message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
    })
  }

  if (score.annotatorId !== null) {
    return yield* new BadRequestError({
      message: "Only system-created annotations can be approved via this flow",
    })
  }

  if (!isValidId(score.sourceId)) {
    return yield* new BadRequestError({
      message: `Annotation ${input.scoreId} was not created by a system queue (sourceId: ${score.sourceId})`,
    })
  }

  yield* startPublishAnnotationWorkflow(workflowStarter, {
    organizationId: score.organizationId,
    projectId: score.projectId,
    scoreId: score.id,
    preEnrichedFeedback: score.feedback,
  })

  const trimmedComment = input.comment?.trim() ?? ""
  yield* queuePublisher.publish(
    "product-feedback",
    "submitSystemAnnotatorReview",
    {
      upstreamScoreId: score.id,
      review: trimmedComment.length > 0 ? { decision: "approve", comment: trimmedComment } : { decision: "approve" },
    },
    { dedupeKey: `submitSystemAnnotatorReview:${score.id}:approve` },
  )

  return { action: "approved", scoreId: score.id } satisfies ApproveSystemAnnotationResult
})
