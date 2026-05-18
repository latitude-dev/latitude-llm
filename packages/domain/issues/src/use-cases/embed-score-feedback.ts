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
  readonly rawFeedback?: string
  readonly rawNormalizedEmbedding?: number[]
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

  const embed = (text: string, kind: "enriched" | "raw") =>
    ai.embed({
      text,
      model: CENTROID_EMBEDDING_MODEL,
      dimensions: CENTROID_EMBEDDING_DIMENSIONS,
      telemetry: {
        spanName: kind === "raw" ? "embed-score-raw-feedback" : "embed-score-feedback",
        tags: ["issues", "embedding"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scoreId: input.scoreId,
          feedbackKind: kind,
        },
      },
    })

  const embedding = yield* embed(score.feedback, "enriched")
  const rawFeedback = score.source === "annotation" ? score.metadata.rawFeedback.trim() : ""
  const shouldEmbedRawFeedback = rawFeedback.length > 0 && rawFeedback !== score.feedback.trim()
  const rawEmbedding = shouldEmbedRawFeedback ? yield* embed(rawFeedback, "raw") : undefined

  return {
    scoreId: score.id,
    feedback: score.feedback,
    normalizedEmbedding: normalizeEmbedding(embedding.embedding),
    ...(rawEmbedding !== undefined
      ? {
          rawFeedback,
          rawNormalizedEmbedding: normalizeEmbedding(rawEmbedding.embedding),
        }
      : {}),
  } satisfies EmbeddedScoreFeedback
})
