import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { drizzle } from "drizzle-orm/node-postgres"
import { Effect } from "effect"
import { Pool, type PoolConfig } from "pg"

const createPostgresDb = (pool: Pool) => drizzle({ client: pool })
export type PostgresDb = ReturnType<typeof createPostgresDb>

export interface PostgresConfig {
  readonly databaseUrl?: string
  readonly maxConnections?: number
  readonly idleTimeoutMs?: number
  readonly connectionTimeoutMs?: number
}

export interface PostgresClient {
  readonly pool: Pool
  readonly db: PostgresDb
}

type CreatePostgresPoolError = MissingEnvValueError | InvalidEnvValueError
type CreatePostgresClientError = CreatePostgresPoolError

export const createPostgresPoolEffect = (config: PostgresConfig = {}): Effect.Effect<Pool, CreatePostgresPoolError> => {
  return Effect.all({
    connectionString: config.databaseUrl ? Effect.succeed(config.databaseUrl) : parseEnv("LAT_DATABASE_URL", "string"),
    max: config.maxConnections ? Effect.succeed(config.maxConnections) : parseEnvOptional("LAT_PG_POOL_MAX", "number"),
    idleTimeoutMillis: config.idleTimeoutMs
      ? Effect.succeed(config.idleTimeoutMs)
      : parseEnvOptional("LAT_PG_IDLE_TIMEOUT_MS", "number"),
    connectionTimeoutMillis: config.connectionTimeoutMs
      ? Effect.succeed(config.connectionTimeoutMs)
      : parseEnvOptional("LAT_PG_CONNECT_TIMEOUT_MS", "number"),
  }).pipe(
    Effect.map((poolConfig) => {
      const configWithTypes: PoolConfig = poolConfig

      return new Pool(configWithTypes)
    }),
  )
}

export const createPostgresPool = (config: PostgresConfig = {}): Pool => {
  return Effect.runSync(createPostgresPoolEffect(config))
}

export const createPostgresClientEffect = (
  config: PostgresConfig = {},
): Effect.Effect<PostgresClient, CreatePostgresClientError> => {
  return createPostgresPoolEffect(config).pipe(
    Effect.map((pool) => {
      const db = createPostgresDb(pool)

      return { db, pool }
    }),
  )
}

export const createPostgresClient = (config: PostgresConfig = {}): PostgresClient => {
  return Effect.runSync(createPostgresClientEffect(config))
}

export const closePostgres = async (pool: Pool): Promise<void> => {
  await pool.end()
}
