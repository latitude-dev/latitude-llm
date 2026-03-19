import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll } from "vitest"
import type { PostgresClient, PostgresDb } from "../client.ts"
import { postgresSchema } from "../schema/index.ts"

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url))

const unsafeCast = <T>(value: unknown): T => value as T

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle>
  readonly postgresDb: PostgresDb
  /** Admin client — runs as the table owner (superuser). RLS is bypassed. */
  readonly adminPostgresClient: PostgresClient
  /**
   * App-role client whose transactions run under the `latitude_app` role so
   * that Postgres RLS policies are enforced.
   */
  readonly appPostgresClient: PostgresClient
}

/**
 * Hono middleware that switches to the non-owner runtime role for the duration
 * of the request so Postgres enforces RLS. Resets to the owner role afterwards.
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

const createPostgresClientFromDb = (postgresDb: PostgresDb): PostgresClient => {
  const transaction = <T>(fn: (txDb: PostgresDb) => Promise<T>): Promise<T> =>
    (postgresDb as unknown as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
      async (tx) => fn(tx as PostgresDb),
    )
  return unsafeCast<PostgresClient>({ db: postgresDb, transaction })
}

const createAppRoleClient = (postgresDb: PostgresDb): PostgresClient => {
  const transaction = <T>(fn: (txDb: PostgresDb) => Promise<T>): Promise<T> =>
    (postgresDb as unknown as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
      async (tx) => {
        await (tx as PostgresDb).execute(sql`SET LOCAL ROLE latitude_app`)
        return fn(tx as PostgresDb)
      },
    )
  return unsafeCast<PostgresClient>({ db: postgresDb, transaction })
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()
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
