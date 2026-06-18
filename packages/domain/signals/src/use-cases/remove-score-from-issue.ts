import { AI, resolveEmbeddingConfig } from "@domain/ai"
import type { ScoreSourceType } from "@domain/scores"
import { type RepositoryError, SignalId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { normalizeEmbedding, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"

export interface RemoveScoreFromSignalInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string | null
  readonly draftedAt: Date | null
  readonly feedback: string
  readonly source_type: ScoreSourceType
  readonly createdAt: Date
}

export type RemoveScoreFromSignalResult =
  | { readonly action: "removed" }
  | { readonly action: "skipped"; readonly reason: "draft" | "not-linked" }
  | { readonly action: "issue-not-found" }

export type RemoveScoreFromSignalError = RepositoryError

export const removeScoreFromSignalUseCase = (input: RemoveScoreFromSignalInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    if (input.signalId !== null) {
      yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    }
    if (input.draftedAt !== null) {
      return { action: "skipped", reason: "draft" } satisfies RemoveScoreFromSignalResult
    }

    if (input.signalId === null) {
      return { action: "skipped", reason: "not-linked" } satisfies RemoveScoreFromSignalResult
    }

    const signalId = input.signalId
    const ai = yield* AI
    const sqlClient = yield* SqlClient
    const embeddingConfig = yield* resolveEmbeddingConfig()

    const embeddingResult = yield* ai.embed({
      text: input.feedback,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
      telemetry: {
        spanName: "embed-score-feedback-for-removal",
        tags: ["issues", "embedding", "removal"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          signalId,
        },
      },
    })

    const normalizedEmbedding = normalizeEmbedding(embeddingResult.embedding)
    const timestamp = new Date()

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository

        const issue = yield* signalRepository.findByIdForUpdate(SignalId(signalId)).pipe(
          Effect.map((issue) => ({ action: "found" as const, issue })),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" as const })),
        )

        if (issue.action === "not-found") {
          return { action: "issue-not-found" } satisfies RemoveScoreFromSignalResult
        }

        const updatedCentroid = updateSignalCentroid({
          centroid: {
            ...issue.issue.centroid,
            clusteredAt: issue.issue.clusteredAt,
          },
          score: {
            embedding: normalizedEmbedding,
            source_type: input.source_type,
            createdAt: input.createdAt,
          },
          operation: "remove",
          timestamp,
        })

        yield* signalRepository.save({
          ...issue.issue,
          centroid: updatedCentroid,
          clusteredAt: updatedCentroid.clusteredAt,
          updatedAt: timestamp,
        })

        return { action: "removed" } satisfies RemoveScoreFromSignalResult
      }),
    )

    return result
  }).pipe(Effect.withSpan("issues.removeScoreFromSignal")) as Effect.Effect<
    RemoveScoreFromSignalResult,
    RemoveScoreFromSignalError
  >
