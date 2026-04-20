import { AI } from "@domain/ai"
import type { ScoreSource } from "@domain/scores"
import { IssueId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_EMBEDDING_MODEL } from "../constants.ts"
import { normalizeEmbedding, updateIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

export interface RemoveScoreFromIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string | null
  readonly draftedAt: Date | null
  readonly feedback: string
  readonly source: ScoreSource
  readonly createdAt: Date
}

export type RemoveScoreFromIssueResult =
  | { readonly action: "removed" }
  | { readonly action: "skipped"; readonly reason: "draft" | "not-linked" }
  | { readonly action: "issue-not-found" }

export type RemoveScoreFromIssueError = RepositoryError

export const removeScoreFromIssueUseCase = (input: RemoveScoreFromIssueInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    if (input.issueId !== null) {
      yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    }
    if (input.draftedAt !== null) {
      return { action: "skipped", reason: "draft" } satisfies RemoveScoreFromIssueResult
    }

    if (input.issueId === null) {
      return { action: "skipped", reason: "not-linked" } satisfies RemoveScoreFromIssueResult
    }

    const issueId = input.issueId
    const ai = yield* AI
    const sqlClient = yield* SqlClient

    const embeddingResult = yield* ai.embed({
      text: input.feedback,
      model: CENTROID_EMBEDDING_MODEL,
      dimensions: CENTROID_EMBEDDING_DIMENSIONS,
      telemetry: {
        spanName: "embed-score-feedback-for-removal",
        tags: ["issues", "embedding", "removal"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId,
        },
      },
    })

    const normalizedEmbedding = normalizeEmbedding(embeddingResult.embedding)
    const timestamp = new Date()

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository

        const issue = yield* issueRepository.findByIdForUpdate(IssueId(issueId)).pipe(
          Effect.map((issue) => ({ action: "found" as const, issue })),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" as const })),
        )

        if (issue.action === "not-found") {
          return { action: "issue-not-found" } satisfies RemoveScoreFromIssueResult
        }

        const updatedCentroid = updateIssueCentroid({
          centroid: {
            ...issue.issue.centroid,
            clusteredAt: issue.issue.clusteredAt,
          },
          score: {
            embedding: normalizedEmbedding,
            source: input.source,
            createdAt: input.createdAt,
          },
          operation: "remove",
          timestamp,
        })

        yield* issueRepository.save({
          ...issue.issue,
          centroid: updatedCentroid,
          clusteredAt: updatedCentroid.clusteredAt,
          updatedAt: timestamp,
        })

        return { action: "removed" } satisfies RemoveScoreFromIssueResult
      }),
    )

    if (result.action === "removed") {
      yield* syncIssueProjectionsUseCase({
        organizationId: input.organizationId,
        issueId,
      })
    }

    return result
  }).pipe(Effect.withSpan("issues.removeScoreFromIssue")) as Effect.Effect<
    RemoveScoreFromIssueResult,
    RemoveScoreFromIssueError
  >
