import { PGlite } from "@electric-sql/pglite"
import { type PostgresDb, postgresRelations, postgresSchema } from "@platform/db-postgres"
import { pushSchema } from "drizzle-kit/api-postgres"
import { type PgliteDatabase, drizzle } from "drizzle-orm/pglite"

export interface InMemoryPostgres {
  readonly client: PGlite
  readonly db: ReturnType<typeof drizzle<typeof postgresSchema, typeof postgresRelations>>
  readonly postgresDb: PostgresDb
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const client = new PGlite()
  await client.exec(`
    CREATE SCHEMA IF NOT EXISTS latitude;
    CREATE OR REPLACE FUNCTION get_current_organization_id() RETURNS TEXT AS $$
    BEGIN RETURN NULLIF(current_setting('app.current_organization_id', true), ''); END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS TEXT AS $$
    BEGIN RETURN NULLIF(current_setting('app.current_user_id', true), ''); END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `)
  const db = drizzle({ client, schema: postgresSchema, relations: postgresRelations })

  const { sqlStatements } = await pushSchema(postgresSchema as Record<string, unknown>, db as unknown as PgliteDatabase)
  const filtered = sqlStatements.filter((s) => !/^(DROP|CREATE) SCHEMA\b/i.test(s.trim()))
  for (const stmt of filtered) {
    await client.exec(stmt)
  }

  return {
    client,
    db,
    postgresDb: db as unknown as PostgresDb,
  }
}

export const closeInMemoryPostgres = async (database: InMemoryPostgres): Promise<void> => {
  await database.client.close()
}
