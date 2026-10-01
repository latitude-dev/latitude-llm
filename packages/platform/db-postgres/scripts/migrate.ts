import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../drizzle.config.ts"
import { migratePostgres } from "../src/migrations/migrate-postgres.ts"

try {
  if (process.argv.length > 2)
    throw new Error("pg:migrate accepts no CLI flags; use drizzle.config.ts and environment variables")
  await migratePostgres({
    connectionString: config.dbCredentials.url,
    migrationConfig: {
      migrationsFolder: resolve(fileURLToPath(new URL("..", import.meta.url)), config.out ?? "drizzle"),
      migrationsTable: config.migrations?.table,
      migrationsSchema: config.migrations?.schema,
    },
  })
  console.log("Postgres migrations complete")
} catch (error) {
  console.error("Postgres migration deployment failed", error)
  process.exitCode = 1
}
