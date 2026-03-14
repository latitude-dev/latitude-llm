import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Data, Effect } from "effect"
import { ApiKey, connectToLocal, connectToWeaviateCloud, type WeaviateClient } from "weaviate-client"
import { defaultWeaviateCollectionDefinitions } from "./collections.ts"
import { migrateWeaviateCollectionsEffect, type WeaviateCollectionMigrationError } from "./migrations.ts"

export interface WeaviateConfig {
  readonly url?: string
  readonly apiKey?: string
  readonly host?: string
  readonly httpPort?: number
  readonly grpcPort?: number
}

interface ResolvedWeaviateConfig {
  readonly url: string | undefined
  readonly apiKey: string
  readonly host: string | undefined
  readonly httpPort: number
  readonly grpcPort: number
}

export class MissingWeaviateEndpointError extends Data.TaggedError("MissingWeaviateEndpointError")<{
  readonly endpoint: "url_or_host"
}> {}

export class WeaviateConnectionError extends Data.TaggedError("WeaviateConnectionError")<{
  readonly stage: "connect" | "healthcheck"
  readonly message: string
}> {}

export class WeaviateUnavailableError extends Data.TaggedError("WeaviateUnavailableError")<{
  readonly ready: boolean
  readonly live: boolean
}> {}

export type CreateWeaviateClientError =
  | MissingEnvValueError
  | InvalidEnvValueError
  | MissingWeaviateEndpointError
  | WeaviateConnectionError
  | WeaviateUnavailableError
  | WeaviateCollectionMigrationError

const normalizeOptional = (value: string | undefined): string | undefined => {
  if (value === undefined || value.length === 0) {
    return undefined
  }

  return value
}

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const resolveWeaviateConfigEffect = (
  config: WeaviateConfig,
): Effect.Effect<ResolvedWeaviateConfig, MissingEnvValueError | InvalidEnvValueError> => {
  return Effect.all({
    url:
      config.url !== undefined
        ? Effect.succeed(normalizeOptional(config.url))
        : parseEnvOptional("LAT_WEAVIATE_URL", "string"),
    apiKey: config.apiKey !== undefined ? Effect.succeed(config.apiKey) : parseEnv("LAT_WEAVIATE_API_KEY", "string"),
    host:
      config.host !== undefined
        ? Effect.succeed(normalizeOptional(config.host))
        : parseEnvOptional("LAT_WEAVIATE_HOST", "string"),
    httpPort:
      config.httpPort !== undefined
        ? Effect.succeed(config.httpPort)
        : parseEnv("LAT_WEAVIATE_HTTP_PORT", "number", 8099),
    grpcPort:
      config.grpcPort !== undefined
        ? Effect.succeed(config.grpcPort)
        : parseEnv("LAT_WEAVIATE_GRPC_PORT", "number", 50051),
  })
}

const connectWeaviateClientEffect = (
  config: ResolvedWeaviateConfig,
): Effect.Effect<WeaviateClient, MissingWeaviateEndpointError | WeaviateConnectionError> => {
  const url = config.url
  if (url !== undefined) {
    return Effect.tryPromise({
      try: () =>
        connectToWeaviateCloud(url, {
          authCredentials: new ApiKey(config.apiKey),
        }),
      catch: (error) =>
        new WeaviateConnectionError({
          stage: "connect",
          message: formatUnknownError(error),
        }),
    })
  }

  const host = config.host
  if (host !== undefined) {
    return Effect.tryPromise({
      try: () =>
        connectToLocal({
          host,
          port: config.httpPort,
          grpcPort: config.grpcPort,
          authCredentials: new ApiKey(config.apiKey),
        }),
      catch: (error) =>
        new WeaviateConnectionError({
          stage: "connect",
          message: formatUnknownError(error),
        }),
    })
  }

  return Effect.fail(new MissingWeaviateEndpointError({ endpoint: "url_or_host" }))
}

const ensureWeaviateHealthEffect = (
  client: WeaviateClient,
): Effect.Effect<WeaviateClient, WeaviateConnectionError | WeaviateUnavailableError> => {
  return Effect.tryPromise({
    try: async () => {
      const [ready, live] = await Promise.all([client.isReady(), client.isLive()])
      return { live, ready }
    },
    catch: (error) =>
      new WeaviateConnectionError({
        stage: "healthcheck",
        message: formatUnknownError(error),
      }),
  }).pipe(
    Effect.flatMap(({ live, ready }) => {
      if (!ready || !live) {
        return Effect.fail(new WeaviateUnavailableError({ live, ready }))
      }

      return Effect.succeed(client)
    }),
  )
}

export const createWeaviateClientEffect = (
  config: WeaviateConfig = {},
): Effect.Effect<WeaviateClient, CreateWeaviateClientError> => {
  return resolveWeaviateConfigEffect(config).pipe(
    Effect.flatMap((resolvedConfig) => connectWeaviateClientEffect(resolvedConfig)),
    Effect.flatMap((client) => ensureWeaviateHealthEffect(client)),
    Effect.flatMap((client) =>
      migrateWeaviateCollectionsEffect(client, defaultWeaviateCollectionDefinitions).pipe(Effect.as(client)),
    ),
  )
}

export const createWeaviateClient = async (config: WeaviateConfig = {}): Promise<WeaviateClient> => {
  return Effect.runPromise(createWeaviateClientEffect(config))
}
