import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Data, Effect } from "effect"
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

class InvalidSqlParameterTypeError extends Data.TaggedError("InvalidSqlParameterTypeError")<{
  readonly type: string
}> {}

class DatabaseExecuteNotSupportedError extends Data.TaggedError("DatabaseExecuteNotSupportedError")<
  Record<string, never>
> {}

type CreatePostgresPoolError = MissingEnvValueError | InvalidEnvValueError
type CreatePostgresClientError = CreatePostgresPoolError

const createPostgresPoolEffect = (config: PostgresConfig = {}): Effect.Effect<Pool, CreatePostgresPoolError> => {
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

const createPostgresClientEffect = (
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

const withPostgresTransaction = async <T>(db: PostgresDb, callback: (txDb: PostgresDb) => Promise<T>): Promise<T> => {
  return (db as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(async (tx) => {
    return callback(tx as PostgresDb)
  })
}

/**
 * Execute a database command within a transaction.
 * Optionally sets organization context for RLS policies.
 *
 * @param db - The database connection
 * @param organizationId - Optional organization ID to set as RLS context
 * @returns Curried function that takes the execute callback
 */
export const runCommand =
  (db: PostgresDb, organizationId?: string) =>
  async <T>(execute: (txDb: PostgresDb) => Promise<T>): Promise<T> => {
    return withPostgresTransaction(db, async (txDb) => {
      if (organizationId) {
        if (typeof organizationId !== "string") {
          throw new InvalidSqlParameterTypeError({ type: typeof organizationId })
        }

        if (typeof db.execute === "function") {
          await db.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`)
        } else {
          throw new DatabaseExecuteNotSupportedError({})
        }
      }

      return execute(txDb)
    })
  }
