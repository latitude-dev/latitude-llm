import { createClient } from '@clickhouse/client'
import { env } from '@latitude-data/env'

export const clickhouse = createClient({
  host: env.CLICKHOUSE_HOST,
  username: env.CLICKHOUSE_USERNAME,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
  clickhouse_settings: {
    // Recommended for async inserts
    async_insert: 1,
    wait_for_async_insert: 0,
  },
})

export type ClickHouseClient = typeof clickhouse
