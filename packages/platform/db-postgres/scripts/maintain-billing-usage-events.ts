import { sql } from "drizzle-orm"
import { closePostgres, createPostgresClient } from "../src/client.ts"

const RETENTION_DAYS = 60
const MONTHS_AHEAD = 3

const client = createPostgresClient()

try {
  await client.db.execute(
    sql`SELECT latitude.maintain_billing_usage_events_retention(${RETENTION_DAYS}, ${MONTHS_AHEAD})`,
  )
  console.log("Billing usage event partition maintenance completed")
} finally {
  await closePostgres(client.pool)
}
