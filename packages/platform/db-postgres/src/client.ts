import { parseEnv, parseEnvOptional } from "@platform/env"
import { drizzle } from "drizzle-orm/node-postgres"
import { Effect } from "effect"
import { Pool } from "pg"

export type PostgresDb = ReturnType<typeof drizzle>
type TransactionDb = Parameters<Parameters<PostgresDb["transaction"]>[0]>[0]
export type Operator = PostgresDb | TransactionDb

export interface PostgresConfig {
  readonly databaseUrl?: string
  readonly maxConnections?: number
  readonly idleTimeoutMs?: number
  readonly connectionTimeoutMs?: number
}

export interface PostgresClient {
  readonly pool: Pool
  readonly db: PostgresDb
  /**
   * Run a callback inside a Postgres transaction.
   * Commits on success, rolls back on any thrown error.
   */
  transaction<T>(fn: (txDb: TransactionDb) => Promise<T>): Promise<T>
}

/**
 * Create a Postgres connection pool with environment-based configuration.
 *
 * @param config Optional overrides for pool configuration
 * @returns A pg.Pool instance
 */
export const createPostgresPool = (config: PostgresConfig = {}): Pool => {
  const poolConfig = Effect.runSync(parsePostgresPoolConfig(config))
  return new Pool(poolConfig)
}

/**
 * Create a Postgres client with connection pool and transaction support.
 *
 * @param config Optional configuration for pool creation
 * @returns A PostgresClient with pool, db, transaction, and withRLS methods
 */
export const createPostgresClient = (config: PostgresConfig = {}): PostgresClient =>
  buildPostgresClient(createPostgresPool(config))

/**
 * Close a Postgres pool and release all connections.
 *
 * @param pool The Pool instance to close
 */
export const closePostgres = async (pool: Pool): Promise<void> => {
  await pool.end()
}

/** Default pool idle timeout: 30 seconds. Keeps stale connections from lingering after a DB restart. */
const DEFAULT_IDLE_TIMEOUT_MS = 30_000
/** Default connection timeout: 5 seconds. Allows fast failure when the DB is temporarily unreachable. */
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000

const parsePostgresPoolConfig = (config: PostgresConfig = {}) =>
  Effect.all({
    connectionString: config.databaseUrl ? Effect.succeed(config.databaseUrl) : parseEnv("LAT_DATABASE_URL", "string"),
    max: config.maxConnections ? Effect.succeed(config.maxConnections) : parseEnvOptional("LAT_PG_POOL_MAX", "number"),
    idleTimeoutMillis: config.idleTimeoutMs
      ? Effect.succeed(config.idleTimeoutMs)
      : parseEnvOptional("LAT_PG_IDLE_TIMEOUT_MS", "number").pipe(Effect.map((v) => v ?? DEFAULT_IDLE_TIMEOUT_MS)),
    connectionTimeoutMillis: config.connectionTimeoutMs
      ? Effect.succeed(config.connectionTimeoutMs)
      : parseEnvOptional("LAT_PG_CONNECT_TIMEOUT_MS", "number").pipe(
          Effect.map((v) => v ?? DEFAULT_CONNECTION_TIMEOUT_MS),
        ),
  })

const buildPostgresClient = (pool: Pool): PostgresClient => {
  // Prevent unhandled rejection crashes when idle connections
  // receive errors (e.g. after a DB restart). The pool automatically
  // removes errored clients and creates fresh ones on the next checkout.
  pool.on("error", (err) => {
    console.error("[pg.Pool] Idle client error (connection will be recycled):", err.message)
  })

  const db = drizzle({ client: pool })
  const transaction = <T>(fn: (tx: TransactionDb) => Promise<T>): Promise<T> => db.transaction(async (tx) => fn(tx))

  return { db, pool, transaction }
}
