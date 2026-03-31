import { AIError, type RerankInput, type RerankResult } from "@domain/ai"
import { Effect } from "effect"
import type { VoyageAIClient } from "voyageai"

export const createRerank =
  (client: VoyageAIClient) =>
  (input: RerankInput): Effect.Effect<readonly RerankResult[], AIError> =>
    Effect.tryPromise({
      try: async () => {
        const response = await client.rerank({
          query: input.query,
          documents: input.documents as string[],
          model: input.model,
          returnDocuments: false,
          truncation: false,
        })

        if (!response.data) {
          return []
        }

        return response.data
          .filter(
            (item): item is typeof item & { index: number; relevanceScore: number } =>
              item.index !== undefined && item.relevanceScore !== undefined,
          )
          .map((item) => ({
            index: item.index,
            relevanceScore: item.relevanceScore,
          }))
      },
      catch: (cause) =>
        new AIError({
          message: `Rerank failed (${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })
