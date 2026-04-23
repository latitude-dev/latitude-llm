import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, type RepositoryError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { deleteAnnotationUseCase } from "./delete-annotation.ts"

export interface RejectSystemAnnotationInput {
  readonly scoreId: ScoreId
  readonly comment: string
}

export type RejectSystemAnnotationError = RepositoryError | BadRequestError | QueuePublishError

export const rejectSystemAnnotationUseCase = Effect.fn("annotations.rejectSystemAnnotation")(function* (
  input: RejectSystemAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.scoreId", input.scoreId)

  const trimmedComment = input.comment.trim()
  if (trimmedComment.length === 0) {
    return yield* new BadRequestError({ message: "Reject requires a non-empty comment" })
  }

  const scoreRepository = yield* ScoreRepository
  const queuePublisher = yield* QueuePublisher

  const score = yield* scoreRepository
    .findById(input.scoreId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new BadRequestError({ message: `Annotation ${input.scoreId} not found` })),
      ),
    )

  if (score.annotatorId !== null) {
    return yield* new BadRequestError({
      message: "Only system-created annotations can be rejected via this flow",
    })
  }

  if (score.draftedAt === null) {
    return yield* new BadRequestError({
      message: `Annotation ${input.scoreId} is already published and cannot be rejected`,
    })
  }

  // Delete + AnnotationDeleted outbox event are owned by the shared delete use
  // case. It re-validates `source === "annotation"` and runs the transaction
  // identically to the human-delete path, so we don't duplicate that logic.
  yield* deleteAnnotationUseCase({ scoreId: score.id })

  yield* queuePublisher.publish(
    "product-feedback",
    "submitSystemAnnotatorReview",
    {
      upstreamScoreId: score.id,
      review: { decision: "reject", comment: trimmedComment },
    },
    { dedupeKey: `submitSystemAnnotatorReview:${score.id}:reject` },
  )
})
