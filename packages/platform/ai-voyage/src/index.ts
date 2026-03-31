import { AI, AICache, AIError, withAICache } from "@domain/ai"
import { Effect, Layer, Option } from "effect"
import type { VoyageAIClient } from "voyageai"
import { createEmbed } from "./embedding.ts"
import { createRerank } from "./rerank.ts"

export { MissingEnvValueError } from "@platform/env"
export type { CreateVoyageClientError, VoyageConfig } from "./client.ts"
export { createVoyageClient, createVoyageClientEffect, VoyageConnectionError } from "./client.ts"

/**
 * Voyage AI adapter providing the `embed` and `rerank` capabilities of the AI service.
 *
 * `generate` is left to the Vercel adapter — compose both Layers at the
 * application boundary to get a complete AI service.
 */
export const AIVoyageLive = (client: VoyageAIClient) =>
  Layer.effect(
    AI,
    Effect.gen(function* () {
      const cache = yield* Effect.serviceOption(AICache)

      const ai = {
        generate: () => Effect.fail(new AIError({ message: "generate is not provided by @platform/ai-voyage" })),

        embed: createEmbed(client),

        rerank: createRerank(client),
      }

      return Option.match(cache, {
        onNone: () => ai,
        onSome: (aiCache) => withAICache(ai, aiCache),
      })
    }),
  )
