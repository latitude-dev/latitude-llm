import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv } from "@platform/env"
import { Data, Effect } from "effect"
import { VoyageAIClient } from "voyageai"

export interface VoyageConfig {
  readonly apiKey?: string
}

export class VoyageConnectionError extends Data.TaggedError("VoyageConnectionError")<{
  readonly message: string
}> {}

export type CreateVoyageClientError = MissingEnvValueError | InvalidEnvValueError | VoyageConnectionError

const resolveApiKey = (config: VoyageConfig): Effect.Effect<string, MissingEnvValueError | InvalidEnvValueError> => {
  if (config.apiKey !== undefined) {
    return Effect.succeed(config.apiKey)
  }

  return parseEnv("LAT_VOYAGE_API_KEY", "string")
}

export const createVoyageClientEffect = (
  config: VoyageConfig = {},
): Effect.Effect<VoyageAIClient, CreateVoyageClientError> => {
  return resolveApiKey(config).pipe(
    Effect.flatMap((apiKey) =>
      Effect.try({
        try: () => new VoyageAIClient({ apiKey }),
        catch: (error) =>
          new VoyageConnectionError({
            message: error instanceof Error ? error.message : String(error),
          }),
      }),
    ),
  )
}

export const createVoyageClient = async (config: VoyageConfig = {}): Promise<VoyageAIClient> => {
  return Effect.runPromise(createVoyageClientEffect(config))
}
