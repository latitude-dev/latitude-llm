import { AI } from "@domain/ai"
import { Effect } from "effect"
import { z } from "zod"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_EMBEDDING_MODEL } from "../constants.ts"
import { normalizeEmbedding } from "../helpers.ts"

const embedIssueSearchQueryInputSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  query: z.string().trim().min(1),
})

export type EmbedIssueSearchQueryInput = z.input<typeof embedIssueSearchQueryInputSchema>

export interface EmbedIssueSearchQueryResult {
  readonly query: string
  readonly normalizedEmbedding: number[]
}

export const embedIssueSearchQueryUseCase = Effect.fn("issues.embedIssueSearchQuery")(function* (input: EmbedIssueSearchQueryInput) {
    const parsed = embedIssueSearchQueryInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", parsed.projectId)
    const ai = yield* AI

    const result = yield* ai.embed({
      text: parsed.query,
      model: CENTROID_EMBEDDING_MODEL,
      dimensions: CENTROID_EMBEDDING_DIMENSIONS,
      telemetry: {
        spanName: "embed-issue-search-query",
        tags: ["issues", "embedding", "search"],
        metadata: {
          organizationId: parsed.organizationId,
          projectId: parsed.projectId,
        },
      },
    })
    const normalizedEmbedding = normalizeEmbedding(result.embedding)

    return {
      query: parsed.query,
      normalizedEmbedding,
    } satisfies EmbedIssueSearchQueryResult
  })
