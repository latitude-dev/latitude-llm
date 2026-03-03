import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { type PostgresDb, postgresRelations, postgresSchema } from "@platform/db-postgres"

interface PGliteClient {
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}

interface DrizzlePgliteModule {
  drizzle: (config: {
    readonly client: PGliteClient
    readonly schema: typeof postgresSchema
    readonly relations: typeof postgresRelations
  }) => unknown
}

interface DrizzleKitApiPostgresModule {
  pushSchema: (schema: Record<string, unknown>, db: unknown) => Promise<{ readonly sqlStatements: readonly string[] }>
}

interface PgliteModule {
  PGlite: new () => PGliteClient
}

const requireFromTestkit = createRequire(import.meta.url)
const requireFromApi = createRequire(new URL("../../../../../apps/api/package.json", import.meta.url))

const resolveDependencyPath = (specifier: string): string => {
  try {
    return requireFromTestkit.resolve(specifier)
  } catch {
    return requireFromApi.resolve(specifier)
  }
}

const loadModule = async <TModule>(specifier: string): Promise<TModule> => {
  const modulePath = resolveDependencyPath(specifier)
  return (await import(pathToFileURL(modulePath).href)) as TModule
}

export interface InMemoryPostgres {
  readonly client: PGliteClient
  readonly db: PostgresDb
  readonly postgresDb: PostgresDb
}

export const createInMemoryPostgres = async (): Promise<InMemoryPostgres> => {
  const { PGlite } = await loadModule<PgliteModule>("@electric-sql/pglite")
  const { drizzle } = await loadModule<DrizzlePgliteModule>("drizzle-orm/pglite")
  const { pushSchema } = await loadModule<DrizzleKitApiPostgresModule>("drizzle-kit/api-postgres")

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

  const db = drizzle({
    client,
    schema: postgresSchema,
    relations: postgresRelations,
  }) as PostgresDb
  const { sqlStatements } = await pushSchema(postgresSchema as Record<string, unknown>, db as unknown)
  const filtered = sqlStatements.filter((statement) => !/^(DROP|CREATE) SCHEMA\b/i.test(statement.trim()))

  for (const statement of filtered) {
    await client.exec(statement)
  }

  return {
    client,
    db,
    postgresDb: db,
  }
}

export const closeInMemoryPostgres = async (database: InMemoryPostgres): Promise<void> => {
  await database.client.close()
}
