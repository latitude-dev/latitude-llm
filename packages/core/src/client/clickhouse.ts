import { env } from '@latitude-data/env'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import tracer from 'dd-trace'
import { randomUUID } from 'crypto'

let _client: ClickHouseClient | undefined

function extractTableName(sql: string): string {
  const match = sql.match(/\b(?:FROM|INTO)\s+([`"]?[\w.]+[`"]?)/i)
  return match ? match[1]!.replace(/[`"]/g, '') : 'unknown'
}

function extractOperation(sql: string): string {
  return sql.trimStart().split(/\s/)[0]?.toUpperCase() ?? 'UNKNOWN'
}

function createTracedClient(raw: ClickHouseClient): ClickHouseClient {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (params: Parameters<ClickHouseClient['query']>[0]) => {
          const queryId = randomUUID()
          return tracer.trace(
            'clickhouse.query',
            {
              tags: {
                'db.system': 'clickhouse',
                'db.statement': params.query.trim().slice(0, 5000),
                'db.operation': extractOperation(params.query),
                'db.params': params.query_params
                  ? JSON.stringify(params.query_params)
                  : '{}',
                'db.table': extractTableName(params.query),
                'clickhouse.query_id': queryId,
                'span.kind': 'client',
              },
            },
            () => target.query({ ...params, query_id: queryId }),
          )
        }
      }

      if (prop === 'insert') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (params: any) => {
          const queryId = randomUUID()
          return tracer.trace(
            'clickhouse.insert',
            {
              tags: {
                'db.system': 'clickhouse',
                'db.operation': 'INSERT',
                'db.table': params.table as string,
                'clickhouse.query_id': queryId,
                'span.kind': 'client',
              },
            },
            () => target.insert({ ...params, query_id: queryId }),
          )
        }
      }

      return Reflect.get(target, prop, receiver)
    },
  }) as ClickHouseClient
}

export function clickhouseClient(): ClickHouseClient {
  if (_client) return _client

  const raw = createClient({
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

  _client = createTracedClient(raw)
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
