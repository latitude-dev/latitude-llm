import { createClient } from '@clickhouse/client'
import { env } from '@latitude-data/env'
import { beforeAll, afterEach } from 'vitest'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { clickhouseClient } from '../client/clickhouse'

const migrationsRoot = fileURLToPath(
  new URL('../../clickhouse/migrations', import.meta.url),
)

let initialized = false
let tables: string[] = []
let testDbName: string

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
    query_params: { db: testDbName },
  })

  const rows = await result.json<{ name: string }>()
  return rows.map((row) => row.name)
}

async function ensureDatabaseExists() {
  const adminClient = createClient({
    url: env.CLICKHOUSE_URL,
    database: 'default',
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
  }) as unknown as ClickhouseCommandClient & { close?: () => Promise<void> }

  await adminClient.command({
    query: `CREATE DATABASE IF NOT EXISTS ${testDbName}`,
  })

  await adminClient.close?.()
}

async function runMigrations() {
  const migrationsFolder =
    env.CLICKHOUSE_CLUSTER_ENABLED === 'true' ? 'clustered' : 'unclustered'
  const migrationsDir = path.join(migrationsRoot, migrationsFolder)
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.up.sql'))
    .sort()

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of statements) {
      await runCommand(statement)
    }
  }
}

async function truncateTables() {
  if (tables.length === 0) return

  await Promise.all(
    tables.map((table) => runCommand(`TRUNCATE TABLE ${testDbName}.${table}`)),
  )
}

function resolveWorkerId() {
  return process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0'
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function resolveTestDbName() {
  const baseDb = process.env.CLICKHOUSE_DB ?? env.CLICKHOUSE_DB
  const workerId = sanitizeIdentifier(resolveWorkerId())
  const pid = sanitizeIdentifier(String(process.pid))

  return sanitizeIdentifier(`${baseDb}_vitest_${workerId}_${pid}`)
}

export default function setupTestClickhouse() {
  beforeAll(async () => {
    if (initialized) return

    testDbName = resolveTestDbName()
    process.env.CLICKHOUSE_DB = testDbName

    await ensureDatabaseExists()
    await runMigrations()
    tables = await listTables()
    initialized = true
  })

  afterEach(async () => {
    if (!initialized) return
    await truncateTables()
  })
}
