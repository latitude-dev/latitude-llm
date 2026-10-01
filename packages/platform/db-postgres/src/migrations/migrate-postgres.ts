import type { MigrationConfig } from "drizzle-orm/migrator"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { prepareOutboxIndexes } from "./outbox-index-preflight.ts"

const prepareWithTimeouts = async (client: pg.Client) => {
  const { rows } = await client.query<{ lock_timeout: string; statement_timeout: string }>(
    "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout",
  )
  const settings = rows[0]
  if (!settings) throw new Error("Could not read migration connection timeouts")
  try {
    await client.query(
      "SELECT set_config('lock_timeout', '5s', false), set_config('statement_timeout', '60min', false)",
    )
    await prepareOutboxIndexes(client)
  } finally {
    await client.query("SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)", [
      settings.lock_timeout,
      settings.statement_timeout,
    ])
  }
}

export const migratePostgres = async ({
  connectionString,
  migrationConfig,
}: {
  connectionString: string
  migrationConfig: MigrationConfig
}) => {
  if (!connectionString) throw new Error("LAT_ADMIN_DATABASE_URL is required for pg:migrate")
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('latitude:pg:migrate')) AS acquired",
    )
    if (!lock.rows[0]?.acquired) throw new Error("Another pg:migrate deployment is running; retry after it finishes")
    await prepareWithTimeouts(client)
    await migrate(drizzle({ client }), migrationConfig)
  } finally {
    await client.end()
  }
}
