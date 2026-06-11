import { createRequire } from "node:module"
import {
  AIError,
  EMBEDDING_DIMENSIONS,
  type EmbedInput,
  type EmbedResult,
  type RerankInput,
  type RerankResult,
} from "@domain/ai"
import { runWithAiTelemetry } from "@platform/ai-latitude"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import type { VoyageAIClient } from "voyageai"

const require = createRequire(import.meta.url)

const requireVoyageAi = () => {
  try {
    return require("voyageai") as {
      VoyageAIClient: new (config: { apiKey: string }) => VoyageAIClient
    }
  } catch {
    const packageRequire = createRequire(require.resolve("@platform/ai-voyage/package.json"))

    return packageRequire("voyageai") as {
      VoyageAIClient: new (config: { apiKey: string }) => VoyageAIClient
    }
  }
}

const createVoyageClient = (): Effect.Effect<VoyageAIClient, AIError> =>
  parseEnv("LAT_VOYAGE_API_KEY", "string").pipe(
    Effect.mapError(
      () =>
        new AIError({
          message: "Voyage AI is unavailable: set LAT_VOYAGE_API_KEY.",
        }),
    ),
    Effect.flatMap((apiKey) =>
      Effect.try({
        try: () => {
          // Note: this is needed because the VoyageAI SDK has a bug with ESM imports
          // https://github.com/voyage-ai/typescript-sdk/issues/26
          const { VoyageAIClient } = requireVoyageAi()
          return new VoyageAIClient({ apiKey })
        },
        catch: (cause) =>
          new AIError({
            message: `Voyage client creation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      }),
    ),
  )

export const embedWithVoyage = (input: EmbedInput): Effect.Effect<EmbedResult, AIError> =>
  Effect.gen(function* () {
    const client = yield* createVoyageClient()

    return yield* Effect.tryPromise({
      try: () =>
        runWithAiTelemetry(input.telemetry, async () => {
          const response = await client.embed({
            input: input.text,
            model: input.model,
            inputType: input.inputType ?? "document",
            truncation: false,
            outputDimension: EMBEDDING_DIMENSIONS,
            outputDtype: "float",
          })

          const first = response.data?.[0]
          if (!first?.embedding) {
            throw new Error("Voyage did not return an embedding")
          }

          return { embedding: first.embedding } satisfies EmbedResult
        }),
      catch: (cause) =>
        new AIError({
          message: `Embedding failed (${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })
  })

export const rerankWithVoyage = (input: RerankInput): Effect.Effect<readonly RerankResult[], AIError> =>
  Effect.gen(function* () {
    const client = yield* createVoyageClient()

    return yield* Effect.tryPromise({
      try: () =>
        runWithAiTelemetry(input.telemetry, async () => {
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
            .map(
              (item): RerankResult => ({
                index: item.index,
                relevanceScore: item.relevanceScore,
              }),
            )
        }),
      catch: (cause) =>
        new AIError({
          message: `Rerank failed (${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    })
  })
