import { OutboxEventWriter } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, type RepositoryError, type ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"

export interface DeleteAnnotationInput {
  readonly scoreId: ScoreId
}

export type DeleteAnnotationError = RepositoryError | BadRequestError

export const deleteAnnotationUseCase = Effect.fn("annotations.deleteAnnotation")(function* (
  input: DeleteAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.scoreId", input.scoreId)
  const sqlClient = yield* SqlClient
  const scoreRepository = yield* ScoreRepository
  const outboxEventWriter = yield* OutboxEventWriter

  const score = yield* scoreRepository
    .findById(input.scoreId)
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new BadRequestError({ message: `Score ${input.scoreId} not found` })),
      ),
    )

  if (score.source !== "annotation") {
    return yield* new BadRequestError({
      message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
    })
  }

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      yield* outboxEventWriter.write({
        eventName: "AnnotationDeleted",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId: score.organizationId,
        payload: {
          organizationId: score.organizationId,
          projectId: score.projectId,
          scoreId: score.id,
          issueId: score.issueId,
          draftedAt: score.draftedAt?.toISOString() ?? null,
          feedback: score.feedback,
          source: score.source,
          createdAt: score.createdAt.toISOString(),
        },
      })

      yield* scoreRepository.delete(input.scoreId)
    }),
  )
})
