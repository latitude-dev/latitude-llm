import {
  BILLING_USAGE_EVENTS_MONTHS_AHEAD,
  BILLING_USAGE_EVENTS_MONTHS_BACK,
  BILLING_USAGE_EVENTS_RETENTION_DAYS,
} from "@domain/billing"
import { sql } from "drizzle-orm"
import type { PostgresClient } from "./client.ts"

export const ensureBillingUsageEventsPartitions = (
  client: PostgresClient,
  options: { monthsBack?: number; monthsAhead?: number } = {},
): Promise<unknown> => {
  const monthsBack = options.monthsBack ?? BILLING_USAGE_EVENTS_MONTHS_BACK
  const monthsAhead = options.monthsAhead ?? BILLING_USAGE_EVENTS_MONTHS_AHEAD
  return client.db.execute(sql`SELECT latitude.ensure_billing_usage_events_partitions(${monthsBack}, ${monthsAhead})`)
}

export const maintainBillingUsageEventsRetention = (
  client: PostgresClient,
  options: { retentionDays?: number; monthsAhead?: number } = {},
): Promise<unknown> => {
  const retentionDays = options.retentionDays ?? BILLING_USAGE_EVENTS_RETENTION_DAYS
  const monthsAhead = options.monthsAhead ?? BILLING_USAGE_EVENTS_MONTHS_AHEAD
  return client.db.execute(
    sql`SELECT latitude.maintain_billing_usage_events_retention(${retentionDays}, ${monthsAhead})`,
  )
}
