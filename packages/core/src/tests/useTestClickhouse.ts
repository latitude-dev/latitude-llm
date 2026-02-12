import { createClient } from '@clickhouse/client'
import { env } from '@latitude-data/env'
import { beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { clickhouseClient } from '../client/clickhouse'

const migrationsRoot = resolveMigrationsRoot()

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

type ClickhouseAuthConfig = {
  url: string
  username: string
  password: string
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
  const auth = await resolveClickhouseAuthConfig()

  const adminClient = createClient({
    url: auth.url,
    database: 'default',
    username: auth.username,
    password: auth.password,
  }) as unknown as ClickhouseCommandClient & { close?: () => Promise<void> }

  await adminClient.command({
    query: `CREATE DATABASE IF NOT EXISTS ${testDbName}`,
  })

  await adminClient.close?.()
}

async function canAuthenticate(config: ClickhouseAuthConfig) {
  const client = createClient({
    url: config.url,
    database: 'default',
    username: config.username,
    password: config.password,
  }) as unknown as {
    ping: () => Promise<{ success: boolean }>
    close?: () => Promise<void>
  }

  try {
    const result = await client.ping()
    return result.success
  } catch {
    return false
  } finally {
    await client.close?.()
  }
}

async function resolveClickhouseAuthConfig() {
  const url = process.env.CLICKHOUSE_URL ?? env.CLICKHOUSE_URL
  const preferredUser = process.env.CLICKHOUSE_USER ?? env.CLICKHOUSE_USER
  const preferredPassword =
    process.env.CLICKHOUSE_PASSWORD ?? env.CLICKHOUSE_PASSWORD

  const candidates: ClickhouseAuthConfig[] = [
    { url, username: preferredUser, password: preferredPassword },
    { url, username: preferredUser, password: '' },
    { url, username: 'default', password: preferredPassword },
    { url, username: 'default', password: '' },
  ]

  for (const candidate of candidates) {
    if (await canAuthenticate(candidate)) {
      process.env.CLICKHOUSE_URL = candidate.url
      process.env.CLICKHOUSE_USER = candidate.username
      process.env.CLICKHOUSE_PASSWORD = candidate.password
      return candidate
    }
  }

  throw new Error(
    `Could not authenticate to ClickHouse at ${url} with configured test credentials`,
  )
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

function resolveMigrationsRoot() {
  const visited = new Set<string>()
  let cursor = process.cwd()

  while (true) {
    const candidates = [
      path.resolve(cursor, 'clickhouse/migrations'),
      path.resolve(cursor, 'packages/core/clickhouse/migrations'),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
      visited.add(candidate)
    }

    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  throw new Error(
    `Could not locate clickhouse migrations directory. Checked: ${Array.from(visited).join(', ')}`,
  )
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
