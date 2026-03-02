import { PGlite } from "@electric-sql/pglite"
import { type PostgresDb, postgresSchema } from "@platform/db-postgres"
import { pushSchema } from "drizzle-kit/api"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/pglite"

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle<typeof postgresSchema>>
  readonly postgresDb: PostgresDb
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()
  await client.exec("CREATE SCHEMA IF NOT EXISTS latitude;")
  const db = drizzle(client, { schema: postgresSchema })

  const { apply } = await pushSchema(
    postgresSchema as Record<string, unknown>,
    db as unknown as PgDatabase<PgQueryResultHKT>,
  )
  await apply()

  return {
    client,
    db,
    postgresDb: db as unknown as PostgresDb,
  }
}

export const closeInMemoryPostgres = async (database: InMemoryPostgres): Promise<void> => {
  await database.client.close()
}
