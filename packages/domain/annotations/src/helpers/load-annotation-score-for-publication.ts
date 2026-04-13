import type { AnnotationScore } from "@domain/scores"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, type ScoreId } from "@domain/shared"
import { Effect } from "effect"

export const loadAnnotationScoreForPublicationMutation = (scoreId: ScoreId) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository

    const score = yield* scoreRepository
      .findById(scoreId)
      .pipe(
        Effect.catchTag("NotFoundError", () =>
          Effect.fail(new BadRequestError({ message: `Score ${scoreId} not found` })),
        ),
      )

    if (score.source !== "annotation") {
      return yield* new BadRequestError({
        message: `Score ${scoreId} is not an annotation (source: ${score.source})`,
      })
    }

    const annotationScore = score as AnnotationScore

    if (score.draftedAt === null) {
      return { kind: "already-published" as const, score: annotationScore }
    }

    return { kind: "draft" as const, score: annotationScore }
  })
