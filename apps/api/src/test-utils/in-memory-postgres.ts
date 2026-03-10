import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../../packages/platform/db-postgres/drizzle", import.meta.url))

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle>
  readonly postgresDb: PostgresDb
}

const unsafeCast = <T>(value: unknown): T => value as T

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()

  // Create the runtime role before migrations so the grant migration finds it
  await client.exec("CREATE ROLE latitude_app NOLOGIN")

  const db = drizzle({ client, schema: postgresSchema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  return {
    client,
    db,
    postgresDb: unsafeCast<PostgresDb>(db),
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
