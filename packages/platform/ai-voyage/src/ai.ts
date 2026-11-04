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
import { Effect, Schedule } from "effect"
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

/**
 * The Voyage SDK's own abort-signal timeout misclassifies under Node's native
 * fetch: `getTimeoutSignal` aborts with the plain string `"timeout"` as the
 * reason, so the rejection isn't `instanceof Error` and fails the SDK's own
 * `error.name === "AbortError"` check — it falls through to a generic
 * `VoyageAIError` whose message is exactly `"timeout"` instead of the
 * purpose-built `VoyageAITimeoutError`. Matching on both keeps this retry
 * correct if the SDK ever classifies it properly.
 */
const isRetryableVoyageTimeout = (error: AIError): boolean => {
  const cause = error.cause
  if (!(cause instanceof Error)) return false
  return cause.name === "VoyageAITimeoutError" || (cause.name === "VoyageAIError" && cause.message === "timeout")
}

// One retry is enough to absorb an occasional slow response without doubling
// worst-case latency too far past the SDK's default 60s per-call timeout.
const VOYAGE_TIMEOUT_RETRY_SCHEDULE = Schedule.addDelay(Schedule.recurs(1), () => Effect.succeed("250 millis"))

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
            // Must stay true: the shared-embedding design embeds whole messages and
            // relies on provider truncation for oversized ones. With `false`, Voyage
            // 400s on any input past its 32k-token window, which both the trace-search
            // indexer and CI session analysis feed it on long messages.
            truncation: true,
            outputDimension: EMBEDDING_DIMENSIONS,
            outputDtype: "float",
          })

          const first = response.data?.[0]
          if (!first?.embedding) {
            throw new Error("Voyage did not return an embedding")
          }

          const tokens = response.usage?.totalTokens
          return {
            embedding: first.embedding,
            ...(tokens === undefined ? {} : { tokens }),
          } satisfies EmbedResult
        }),
      catch: (cause) =>
        new AIError({
          message: `Embedding failed (${input.model}): ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    }).pipe(Effect.retry({ while: isRetryableVoyageTimeout, schedule: VOYAGE_TIMEOUT_RETRY_SCHEDULE }))
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
            // Truncate oversized documents to the model window rather than 400 the
            // whole rerank request (same failure mode as embed above).
            truncation: true,
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
    }).pipe(Effect.retry({ while: isRetryableVoyageTimeout, schedule: VOYAGE_TIMEOUT_RETRY_SCHEDULE }))
  })
