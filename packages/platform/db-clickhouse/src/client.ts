import { type ClickHouseClient, type ClickHouseClientConfigOptions, createClient } from "@clickhouse/client"
import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv } from "@platform/env"
import { Effect } from "effect"

export interface ClickhouseConfig {
  readonly url?: string
  readonly username?: string
  readonly password?: string
  readonly database?: string
}

type CreateClickhouseClientError = MissingEnvValueError | InvalidEnvValueError

/** Default request timeout: 30 seconds. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
/** Default max open connections (sockets per host). */
const DEFAULT_MAX_OPEN_CONNECTIONS = 10

export const createClickhouseClientEffect = (
  config: ClickhouseConfig = {},
): Effect.Effect<ClickHouseClient, CreateClickhouseClientError> => {
  return Effect.all({
    url: config.url ? Effect.succeed(config.url) : parseEnv("CLICKHOUSE_URL", "string"),
    username: config.username ? Effect.succeed(config.username) : parseEnv("CLICKHOUSE_USER", "string"),
    password: config.password ? Effect.succeed(config.password) : parseEnv("CLICKHOUSE_PASSWORD", "string"),
    database: config.database ? Effect.succeed(config.database) : parseEnv("CLICKHOUSE_DB", "string"),
  }).pipe(
    Effect.map((resolvedConfig) => {
      const options: ClickHouseClientConfigOptions = {
        url: resolvedConfig.url,
        username: resolvedConfig.username,
        password: resolvedConfig.password,
        database: resolvedConfig.database,
        // Keep-alive enabled so the HTTP agent reuses sockets, but stale
        // sockets are discarded automatically by Node's HTTP agent when the
        // server closes the connection (e.g. after a restart).
        keep_alive: { enabled: true },
        request_timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        max_open_connections: DEFAULT_MAX_OPEN_CONNECTIONS,
      }

      return createClient(options)
    }),
  )
}

export const createClickhouseClient = (config: ClickhouseConfig = {}): ClickHouseClient => {
  return Effect.runSync(createClickhouseClientEffect(config))
}

export const closeClickhouse = async (client: ClickHouseClient): Promise<void> => {
  await client.close()
}
