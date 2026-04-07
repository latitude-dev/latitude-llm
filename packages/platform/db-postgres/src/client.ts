import { parseEnvOptionalSync, parseEnvSync } from "@platform/env"
import { createLogger } from "@repo/observability"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

const poolLogger = createLogger("db-postgres")

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
 * Pool creation is synchronous: the pool opens connections lazily on first use.
 * Env validation runs here (not at module import), so importing this module has
 * no database or env side effects.
 *
 * @param config Optional overrides for pool configuration
 * @returns A pg.Pool instance
 */
export const createPostgresPool = (config: PostgresConfig = {}): Pool => {
  const poolConfig = resolvePostgresPoolConfig(config)
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

const resolvePostgresPoolConfig = (config: PostgresConfig = {}) => ({
  connectionString: config.databaseUrl ?? parseEnvSync("LAT_DATABASE_URL", "string"),
  max: config.maxConnections ?? parseEnvOptionalSync("LAT_PG_POOL_MAX", "number"),
  idleTimeoutMillis:
    config.idleTimeoutMs ?? parseEnvOptionalSync("LAT_PG_IDLE_TIMEOUT_MS", "number") ?? DEFAULT_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis:
    config.connectionTimeoutMs ??
    parseEnvOptionalSync("LAT_PG_CONNECT_TIMEOUT_MS", "number") ??
    DEFAULT_CONNECTION_TIMEOUT_MS,
})

const buildPostgresClient = (pool: Pool): PostgresClient => {
  // Prevent unhandled rejection crashes when idle connections
  // receive errors (e.g. after a DB restart). The pool automatically
  // removes errored clients and creates fresh ones on the next checkout.
  pool.on("error", (err) => {
    poolLogger.error("[pg.Pool] Idle client error (connection will be recycled):", err.message)
  })

  const db = drizzle({ client: pool })
  const transaction = <T>(fn: (tx: TransactionDb) => Promise<T>): Promise<T> => db.transaction(async (tx) => fn(tx))

  return { db, pool, transaction }
}
