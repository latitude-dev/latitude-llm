import { env } from '@latitude-data/env'
import { createClient, type ClickHouseClient } from '@clickhouse/client'

let _client: ClickHouseClient | undefined

export function clickhouseClient(): ClickHouseClient {
  if (_client) return _client

  _client = createClient({
    url: env.CLICKHOUSE_URL,
    database: env.CLICKHOUSE_DB,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    keep_alive: { enabled: true },
    request_timeout: 30_000,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  })

  return _client
}

export async function clickhouseHealthCheck(): Promise<boolean> {
  try {
    const client = clickhouseClient()
    const result = await client.ping()
    return result.success
  } catch {
    return false
  }
}
