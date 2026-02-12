import { env } from '@latitude-data/env'
import { createClient, type ClickHouseClient } from '@clickhouse/client'

let _client: ClickHouseClient | undefined
let _clientKey: string | undefined

function readClickhouseConfig() {
  return {
    url: env.CLICKHOUSE_URL,
    database: env.CLICKHOUSE_DB,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
  }
}

export function clickhouseClient(): ClickHouseClient {
  const config = readClickhouseConfig()
  const key = `${config.url}|${config.database}|${config.username}|${config.password}`
  if (_client && _clientKey === key) return _client

  if (_client && _clientKey !== key) {
    void _client.close()
  }

  _client = createClient({
    url: config.url,
    database: config.database,
    username: config.username,
    password: config.password,
    keep_alive: { enabled: true },
    request_timeout: 30_000,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  })
  _clientKey = key

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
