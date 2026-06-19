import { AI, resolveEmbeddingConfig } from "@domain/ai"
import { Effect } from "effect"
import { z } from "zod"
import { normalizeEmbedding } from "../helpers.ts"

const embedSignalSearchQueryInputSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  query: z.string().trim().min(1),
})

export type EmbedSignalSearchQueryInput = z.input<typeof embedSignalSearchQueryInputSchema>

export interface EmbedSignalSearchQueryResult {
  readonly query: string
  readonly normalizedEmbedding: number[]
}

export const embedSignalSearchQueryUseCase = Effect.fn("issues.embedSignalSearchQuery")(function* (
  input: EmbedSignalSearchQueryInput,
) {
  const parsed = embedSignalSearchQueryInputSchema.parse(input)
  yield* Effect.annotateCurrentSpan("projectId", parsed.projectId)
  const ai = yield* AI
  const embeddingConfig = yield* resolveEmbeddingConfig()

  const result = yield* ai.embed({
    text: parsed.query,
    provider: embeddingConfig.provider,
    model: embeddingConfig.model,
    telemetry: {
      spanName: "embed-signal-search-query",
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
  } satisfies EmbedSignalSearchQueryResult
})
