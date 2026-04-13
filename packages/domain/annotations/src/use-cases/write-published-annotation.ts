import {
  type AnnotationScoreMetadata,
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  ScoreRepository,
} from "@domain/scores"
import { type BadRequestError, type RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import type { z } from "zod"
import { annotationDraftWriteInputSchema } from "../helpers/annotation-draft-write-schema.ts"
import { writeAnnotation } from "../helpers/write-annotation.ts"

export const writeAnnotationInputSchema = annotationDraftWriteInputSchema

export type WriteAnnotationInput = z.input<typeof writeAnnotationInputSchema>

export type WriteAnnotationError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

/**
 * UI / API: create or update an annotation score as **published** (`draftedAt` cleared).
 * To update an existing row that is still a draft, pass `id` (typically after the draft was created elsewhere).
 */
export const writePublishedAnnotationUseCase = (input: WriteAnnotationInput) =>
  Effect.gen(function* () {
    const parsed = annotationDraftWriteInputSchema.parse(input)
    const sqlClient = yield* SqlClient
    const scoreRepository = yield* ScoreRepository

    let anchor = parsed.anchor
    let annotatorId = parsed.annotatorId

    if (parsed.id) {
      const existingScore = yield* scoreRepository
        .findById(parsed.id)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

      if (existingScore) {
        if (annotatorId === null && existingScore.annotatorId !== null) {
          annotatorId = UserId(existingScore.annotatorId)
        }

        if (!anchor) {
          const existingMetadata = existingScore.metadata as AnnotationScoreMetadata | undefined
          if (existingMetadata?.messageIndex !== undefined) {
            anchor = {
              messageIndex: existingMetadata.messageIndex,
              partIndex: existingMetadata.partIndex,
              startOffset: existingMetadata.startOffset,
              endOffset: existingMetadata.endOffset,
            }
          }
        }
      }
    }

    return yield* writeAnnotation(
      {
        ...parsed,
        organizationId: sqlClient.organizationId,
        annotatorId,
        anchor,
      },
      null,
    )
  })
