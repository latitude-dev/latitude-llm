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
/**
 * Discard a pooled keep-alive socket after this long idle. Must stay below the
 * server's (and any load balancer's) keep-alive timeout so the client never
 * reuses a socket the peer is about to close — that race surfaces as
 * `ECONNRESET`. ClickHouse's default `keep_alive_timeout` is 3s; 2.5s leaves a
 * safety margin. Retries in `ch-sql-client` cover the residual race.
 */
const KEEP_ALIVE_IDLE_SOCKET_TTL_MS = 2_500

export const createClickhouseClientEffect = (
  config: ClickhouseConfig = {},
): Effect.Effect<ClickHouseClient, CreateClickhouseClientError> => {
  return Effect.all({
    url: config.url ? Effect.succeed(config.url) : parseEnv("LAT_CLICKHOUSE_URL", "string"),
    username: config.username ? Effect.succeed(config.username) : parseEnv("LAT_CLICKHOUSE_USER", "string"),
    password: config.password ? Effect.succeed(config.password) : parseEnv("LAT_CLICKHOUSE_PASSWORD", "string"),
    database: config.database ? Effect.succeed(config.database) : parseEnv("LAT_CLICKHOUSE_DB", "string"),
  }).pipe(
    Effect.map((resolvedConfig) => {
      const options: ClickHouseClientConfigOptions = {
        url: resolvedConfig.url,
        username: resolvedConfig.username,
        password: resolvedConfig.password,
        database: resolvedConfig.database,
        keep_alive: { enabled: true, idle_socket_ttl: KEEP_ALIVE_IDLE_SOCKET_TTL_MS },
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
