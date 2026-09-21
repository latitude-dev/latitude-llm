import { OutboxEventWriter } from "@domain/events"
import {
  type AnnotationScore,
  annotationScoreSchema,
  replaceScoreAnalyticsUseCase,
  ScoreRepository,
} from "@domain/scores"
import { NotFoundError, type ProjectId, ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { anchorFromExistingAnnotationScore } from "../helpers/anchor-from-existing-annotation-score.ts"
import { buildAnnotationScoreMetadata } from "../helpers/build-annotation-score-metadata.ts"
import { deleteAnnotationUseCase } from "./delete-annotation.ts"

interface ApiAnnotationReference {
  readonly projectId: ProjectId
  readonly annotationId: string
}

export interface UpdateApiAnnotationInput extends ApiAnnotationReference {
  readonly value?: number | undefined
  readonly passed?: boolean | undefined
  readonly feedback?: string | undefined
}

const findApiAnnotation = Effect.fn("annotations.findApiAnnotation")(function* (input: ApiAnnotationReference) {
  const scoreRepository = yield* ScoreRepository
  const score = yield* scoreRepository
    .findById(ScoreId(input.annotationId))
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

  if (!score || score.projectId !== input.projectId || score.sourceType !== "annotation" || score.sourceId !== "API") {
    return yield* new NotFoundError({ entity: "Annotation", id: input.annotationId })
  }

  return score
})

export const getApiAnnotationUseCase = Effect.fn("annotations.getApiAnnotation")(function* (
  input: ApiAnnotationReference,
) {
  return yield* findApiAnnotation(input)
})

export const updateApiAnnotationUseCase = Effect.fn("annotations.updateApiAnnotation")(function* (
  input: UpdateApiAnnotationInput,
) {
  const sqlClient = yield* SqlClient
  const result = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const existing = yield* findApiAnnotation(input)
      const rawFeedback = input.feedback ?? existing.metadata.rawFeedback
      const value = input.value ?? existing.value
      const passed = input.passed ?? existing.passed

      if (rawFeedback === existing.metadata.rawFeedback && value === existing.value && passed === existing.passed) {
        return { changed: false, score: existing } as const
      }

      const updatedAt = new Date()
      const score = annotationScoreSchema.parse({
        ...existing,
        value,
        passed,
        feedback: rawFeedback,
        metadata: buildAnnotationScoreMetadata(rawFeedback, anchorFromExistingAnnotationScore(existing)),
        signalId: null,
        updatedAt,
      })

      const scoreRepository = yield* ScoreRepository
      const outboxEventWriter = yield* OutboxEventWriter
      yield* scoreRepository.save(score)
      yield* outboxEventWriter.write({
        eventName: "AnnotationUpdated",
        aggregateType: "score",
        aggregateId: score.id,
        organizationId: score.organizationId,
        payload: {
          organizationId: score.organizationId,
          projectId: score.projectId,
          scoreId: score.id,
          previousSignalId: existing.signalId,
          previousFeedback: existing.feedback,
          source: existing.sourceType,
          createdAt: existing.createdAt.toISOString(),
          revision: updatedAt.toISOString(),
        },
      })

      return { changed: true, score } as const
    }),
  )

  if (result.changed) {
    yield* replaceScoreAnalyticsUseCase({ scoreId: result.score.id })
  }
  return result.score as AnnotationScore
})

export const deleteApiAnnotationUseCase = Effect.fn("annotations.deleteApiAnnotation")(function* (
  input: ApiAnnotationReference,
) {
  const score = yield* findApiAnnotation(input)
  yield* deleteAnnotationUseCase({ scoreId: score.id })
})
