import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { type PostgresClient, type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll } from "vitest"

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../db-postgres/drizzle", import.meta.url))

/**
 * Hono middleware that switches to the non-owner runtime role for the duration
 * of the request so Postgres enforces RLS. Resets to the owner role
 * afterwards so seed/assertion queries remain unrestricted.
 */
export function createRlsMiddleware(client: PGlite) {
  return async (_c: unknown, next: () => Promise<void>) => {
    await client.exec("SET ROLE latitude_app")
    try {
      await next()
    } finally {
      await client.exec("RESET ROLE")
    }
  }
}

const unsafeCast = <T>(value: unknown): T => value as T

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle>
  readonly postgresDb: PostgresDb
  /** Admin client — runs as the table owner (superuser). RLS is bypassed. */
  readonly adminPostgresClient: PostgresClient
  /**
   * App-role client whose transactions run under the `latitude_app` role so
   * that Postgres RLS policies are enforced. The role switch is injected via
   * drizzle's `tx.execute()` (transaction-scoped) before each query batch.
   */
  readonly appPostgresClient: PostgresClient
}

const createPostgresClientFromDb = (postgresDb: PostgresDb): PostgresClient => {
  const transaction = <T>(fn: (txDb: PostgresDb) => Promise<T>): Promise<T> =>
    (postgresDb as unknown as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
      async (tx) => fn(tx as PostgresDb),
    )
  return unsafeCast<PostgresClient>({ db: postgresDb, transaction })
}

/**
 * Create an app-role client that switches to `latitude_app` for each
 * transaction so that RLS policies are enforced.
 *
 * The role switch uses `SET LOCAL ROLE` executed through drizzle's transaction
 * `tx` handle (not via a raw `pglite.exec` call) to avoid interleaving raw
 * PGlite I/O with drizzle's serialized connection queue, which would deadlock
 * on the single-connection PGlite instance.
 */
const createAppRoleClient = (postgresDb: PostgresDb): PostgresClient => {
  const transaction = <T>(fn: (txDb: PostgresDb) => Promise<T>): Promise<T> =>
    (postgresDb as unknown as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
      async (tx) => {
        // Switch to the runtime role so RLS policies apply.
        // SET LOCAL is transaction-scoped and reverts automatically on
        // commit/rollback — no cleanup needed.
        await (tx as PostgresDb).execute(sql`SET LOCAL ROLE latitude_app`)
        return fn(tx as PostgresDb)
      },
    )
  return unsafeCast<PostgresClient>({ db: postgresDb, transaction })
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()

  // Create the runtime role before migrations so the grant migration finds it.
  await client.exec("CREATE ROLE latitude_app NOLOGIN")

  const db = drizzle({ client, schema: postgresSchema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  const postgresDb = unsafeCast<PostgresDb>(db)

  return {
    client,
    db,
    postgresDb,
    adminPostgresClient: createPostgresClientFromDb(postgresDb),
    appPostgresClient: createAppRoleClient(postgresDb),
  }
}

export const closeInMemoryPostgres = async (database: InMemoryPostgres): Promise<void> => {
  await database.client.close()
}

interface TestPostgresContext {
  readonly client: PGlite
  readonly db: InMemoryPostgres["db"]
  readonly postgresDb: PostgresDb
  readonly adminPostgresClient: PostgresClient
  readonly appPostgresClient: PostgresClient
}

/**
 * Registers beforeAll / afterAll hooks for a PGlite-backed test file.
 * - beforeAll: creates PGlite instance, runs migrations
 * - afterAll: closes the PGlite connection
 *
 * Returns an object whose properties resolve lazily after beforeAll.
 */
export function setupTestPostgres(): TestPostgresContext {
  let pg: InMemoryPostgres

  beforeAll(async () => {
    pg = await createInMemoryPostgres()
  })

  afterAll(async () => {
    await closeInMemoryPostgres(pg)
  })

  return {
    get client() {
      return pg.client
    },
    get db() {
      return pg.db
    },
    get postgresDb() {
      return pg.postgresDb
    },
    get adminPostgresClient() {
      return pg.adminPostgresClient
    },
    get appPostgresClient() {
      return pg.appPostgresClient
    },
  }
}
