import { AIError, type EmbedInput, type EmbedResult } from "@domain/ai"
import { Effect } from "effect"
import type { VoyageAIClient } from "voyageai"

export const createEmbed =
  (client: VoyageAIClient) =>
  (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
    Effect.tryPromise({
      try: async () => {
        const response = await client.embed({
          input: input.text,
          model: input.model,
          inputType: "document",
          truncation: false,
          outputDimension: input.dimensions,
          outputDtype: "float",
        })

        const first = response.data?.[0]
        if (!first?.embedding) {
          throw new Error("Voyage did not return an embedding")
        }

        return { embedding: first.embedding }
      },
      catch: (cause) =>
        new AIError({
          message: `Embedding failed (${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })
