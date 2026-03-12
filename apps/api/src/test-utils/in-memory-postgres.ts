import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { type PostgresClient, type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../../packages/platform/db-postgres/drizzle", import.meta.url))

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle>
  readonly postgresDb: PostgresDb
  readonly postgresClient: PostgresClient
}

const unsafeCast = <T>(value: unknown): T => value as T

const createInMemoryPostgresClient = (postgresDb: PostgresDb): PostgresClient => {
  const transaction = <T>(fn: (txDb: PostgresDb) => Promise<T>): Promise<T> =>
    (postgresDb as unknown as { transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T> }).transaction(
      async (tx) => fn(tx as PostgresDb),
    )

  return unsafeCast<PostgresClient>({ db: postgresDb, transaction })
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()

  // Create the runtime role before migrations so the grant migration finds it
  await client.exec("CREATE ROLE latitude_app NOLOGIN")

  const db = drizzle({ client, schema: postgresSchema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  const postgresDb = unsafeCast<PostgresDb>(db)

  return {
    client,
    db,
    postgresDb,
    postgresClient: createInMemoryPostgresClient(postgresDb),
  }
}

/**
 * Middleware that switches to the non-owner runtime role for the duration
 * of the request so Postgres enforces RLS. Resets to the owner role
 * afterwards so seed/assertion queries remain unrestricted.
 */
export const createRlsMiddleware = (client: PGlite) => {
  return async (_c: unknown, next: () => Promise<void>) => {
    await client.exec("SET ROLE latitude_app")
    try {
      await next()
    } finally {
      await client.exec("RESET ROLE")
    }
  }
}

export const closeInMemoryPostgres = async (database: InMemoryPostgres): Promise<void> => {
  await database.client.close()
}
