import { env } from '@latitude-data/env'
import { afterEach, beforeAll } from 'vitest'
import { clickhouseClient } from '../client/clickhouse'

let initialized = false
let tables: string[] = []

type ClickhouseCommandClient = {
  command: (args: { query: string }) => Promise<unknown>
}

type ClickhouseQueryClient = {
  query: (args: {
    query: string
    format: string
    query_params?: Record<string, unknown>
  }) => Promise<{ json: <T>() => Promise<T[]> }>
}

async function runCommand(query: string) {
  const client = clickhouseClient() as unknown as ClickhouseCommandClient
  await client.command({ query })
}

async function listTables() {
  const client = clickhouseClient() as unknown as ClickhouseQueryClient
  const result = await client.query({
    query: 'SELECT name FROM system.tables WHERE database = {db: String}',
    format: 'JSONEachRow',
    query_params: { db: env.CLICKHOUSE_DB },
  })

  const rows = await result.json<{ name: string }>()
  return rows.map((row) => row.name)
}

async function truncateTables() {
  if (tables.length === 0) return

  await Promise.all(
    tables.map((table) =>
      runCommand(`TRUNCATE TABLE ${env.CLICKHOUSE_DB}.${table}`),
    ),
  )
}

export default function setupTestClickhouse() {
  beforeAll(async () => {
    if (initialized) return

    tables = await listTables()
    initialized = true
  })

  afterEach(async () => {
    if (!initialized) return
    await truncateTables()
  })
}
