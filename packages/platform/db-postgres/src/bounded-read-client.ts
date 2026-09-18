import { createLogger } from "@repo/observability"
import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool, PoolClient } from "pg"
import { createPostgresPool, type PostgresClient } from "./client.ts"

const poolLogger = createLogger("db-postgres/bounded-read-client")

type TransactionDb = Parameters<Parameters<PostgresClient["transaction"]>[0]>[0]

export interface BoundedReadPostgresConfig {
  readonly databaseUrl?: string
  readonly acquisitionTimeoutMs: number
  readonly transactionTimeoutMs: number
  readonly statementTimeoutMs: number
}

interface BoundedReadPool {
  connect(): Promise<PoolClient>
  on(event: "error", listener: (error: Error) => void): unknown
}

export const createBoundedReadPostgresClient = (config: BoundedReadPostgresConfig): PostgresClient => {
  validateConfig(config)
  const poolConfig = {
    maxConnections: 1,
    connectionTimeoutMs: config.acquisitionTimeoutMs,
  }
  const pool = createPostgresPool(config.databaseUrl ? { ...poolConfig, databaseUrl: config.databaseUrl } : poolConfig)
  return buildBoundedReadPostgresClient(pool, config)
}

export const buildBoundedReadPostgresClient = (
  pool: BoundedReadPool,
  config: BoundedReadPostgresConfig,
): PostgresClient => {
  validateConfig(config)
  pool.on("error", (error) => {
    poolLogger.error("[pg.Pool] Idle client error (connection will be recycled):", error.message)
  })

  let busy = false
  const db = drizzle({ client: pool as Pool })

  const transaction = <T>(fn: (tx: TransactionDb) => Promise<T>): Promise<T> => {
    if (busy) return Promise.reject(new Error("Bounded read Postgres client is busy"))
    busy = true

    return new Promise<T>((resolve, reject) => {
      let client: PoolClient | undefined
      let expired = false
      let settled = false
      let released = false
      let clientError: Error | undefined
      let clientErrorListener: ((error: Error) => void) | undefined
      const timeoutError = new Error("Bounded read Postgres transaction timed out")

      const release = (destroy: boolean) => {
        if (!client || released) return
        released = true
        if (clientErrorListener) client.removeListener("error", clientErrorListener)
        client.release(destroy)
      }

      const settle = (result: { readonly value: T } | { readonly error: unknown }) => {
        if (settled) return
        settled = true
        busy = false
        clearTimeout(deadline)
        if ("error" in result) reject(result.error)
        else resolve(result.value)
      }

      const deadline = setTimeout(() => {
        expired = true
        release(true)
        settle({ error: timeoutError })
      }, config.transactionTimeoutMs)

      const assertActive = () => {
        if (expired) throw timeoutError
        if (clientError) throw clientError
      }

      const handleClientError = (error: Error) => {
        if (settled) return
        clientError = error
        release(true)
        settle({ error })
      }

      const execute = async () => {
        client = await pool.connect()
        clientErrorListener = handleClientError
        client.on("error", clientErrorListener)
        assertActive()
        const tx = drizzle({ client }) as unknown as TransactionDb
        await client.query("BEGIN READ ONLY")
        assertActive()
        await client.query("SELECT set_config('statement_timeout', $1, true)", [String(config.statementTimeoutMs)])
        assertActive()
        const value = await fn(tx)
        assertActive()
        await client.query("COMMIT")
        assertActive()
        return value
      }

      const fail = async (error: unknown) => {
        if (settled && clientError) return
        if (!expired && client) {
          try {
            await client.query("ROLLBACK")
          } catch (rollbackError) {
            poolLogger.error("[pg.Pool] Failed to roll back bounded read transaction:", rollbackError)
          }
        }
        release(true)
        settle({ error })
      }

      void execute().then(
        (value) => {
          release(false)
          settle({ value })
        },
        (error: unknown) => {
          void fail(error)
        },
      )
    })
  }

  return { db, pool: pool as Pool, transaction }
}

const validateConfig = (config: BoundedReadPostgresConfig) => {
  for (const [name, value] of Object.entries({
    acquisitionTimeoutMs: config.acquisitionTimeoutMs,
    transactionTimeoutMs: config.transactionTimeoutMs,
    statementTimeoutMs: config.statementTimeoutMs,
  })) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a finite positive integer`)
    }
  }
}
