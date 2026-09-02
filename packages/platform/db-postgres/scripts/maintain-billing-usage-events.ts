import { closePostgres, createPostgresClient } from "../src/client.ts"
import { maintainBillingUsageEventsRetention } from "../src/maintain-billing-usage-events.ts"

const client = createPostgresClient()

try {
  await maintainBillingUsageEventsRetention(client)
  console.log("Billing usage event partition maintenance completed")
} finally {
  await closePostgres(client.pool)
}
