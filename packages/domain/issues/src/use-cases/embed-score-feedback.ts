import { AI } from "@domain/ai"
import { ScoreRepository } from "@domain/scores"
import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_EMBEDDING_MODEL } from "../constants.ts"
import { ScoreNotFoundForDiscoveryError } from "../errors.ts"
import { normalizeEmbedding } from "../helpers.ts"

export interface EmbedScoreFeedbackInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}

export interface EmbeddedScoreFeedback {
  readonly scoreId: string
  readonly feedback: string
  readonly normalizedEmbedding: number[]
}

export const embedScoreFeedbackUseCase = Effect.fn("issues.embedScoreFeedback")(function* (
  input: EmbedScoreFeedbackInput,
) {
  yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  const scoreRepository = yield* ScoreRepository
  const ai = yield* AI

  const score = yield* scoreRepository
    .findById(ScoreId(input.scoreId))
    .pipe(
      Effect.catchTag("NotFoundError", () =>
        Effect.fail(new ScoreNotFoundForDiscoveryError({ scoreId: input.scoreId })),
      ),
    )

  const embedding = yield* ai.embed({
    text: score.feedback,
    model: CENTROID_EMBEDDING_MODEL,
    dimensions: CENTROID_EMBEDDING_DIMENSIONS,
    telemetry: {
      spanName: "embed-score-feedback",
      tags: ["issues", "embedding"],
      metadata: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        scoreId: input.scoreId,
      },
    },
  })

  return {
    scoreId: score.id,
    feedback: score.feedback,
    normalizedEmbedding: normalizeEmbedding(embedding.embedding),
  } satisfies EmbeddedScoreFeedback
})
