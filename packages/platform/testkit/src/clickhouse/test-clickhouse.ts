import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ClickHouseClient } from "@clickhouse/client"
import { Session } from "chdb"
import { afterAll, beforeAll, beforeEach } from "vitest"

type ChdbSession = InstanceType<typeof Session>

export interface TestClickHouse {
  readonly client: ClickHouseClient
  readonly session: ChdbSession
  cleanup(): void
}

/**
 * Replaces ClickHouse parameter placeholders ({name:Type}) with literal values.
 * chdb only accepts raw SQL; the real client sends params separately and the server
 * substitutes. This test double does substitution locally before calling session.query().
 */
function substituteParams(sql: string, params?: Record<string, unknown>): string {
  if (!params) return sql
  return sql.replace(/\{(\w+):[\w()]+?\}/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) return "NULL"
    if (Array.isArray(value)) {
      const escaped = value.map((v) =>
        typeof v === "string" ? `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : String(v),
      )
      return `[${escaped.join(", ")}]`
    }
    if (typeof value === "number" || typeof value === "bigint") return String(value)
    if (typeof value === "boolean") return value ? "true" : "false"
    return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  })
}

export function createTestClickHouse(): TestClickHouse {
  const session = new Session()
  const client = {
    async query(params: { query: string; query_params?: Record<string, unknown>; format?: string }) {
      const sql = substituteParams(params.query, params.query_params)
      const format = params.format ?? "JSONEachRow"
      const raw = session.query(sql, format)

      return {
        json<T>(): Promise<T[]> {
          const trimmed = raw.trim()
          if (!trimmed) return Promise.resolve([] as T[])
          const lines = trimmed.split("\n")
          return Promise.resolve(lines.map((line) => JSON.parse(line)) as T[])
        },
        text(): Promise<string> {
          return Promise.resolve(raw)
        },
      }
    },

    async command(params: { query: string; query_params?: Record<string, unknown> }) {
      const sql = substituteParams(params.query, params.query_params)
      session.query(sql)
      return { query_id: "test" }
    },

    async insert<T>(params: { table: string; values: T[]; format?: string }) {
      if (!params.values || params.values.length === 0) return { executed: false, query_id: "" }
      const lines = params.values.map((v) => JSON.stringify(v)).join("\n")
      session.query(`INSERT INTO ${params.table} FORMAT JSONEachRow ${lines}`)
      return { executed: true, query_id: "test" }
    },

    async ping() {
      return { success: true }
    },

    async close() {
      /* cleanup() handles lifecycle */
    },
  } as unknown as ClickHouseClient

  return {
    client,
    session,
    cleanup: () => session.cleanup(),
  }
}

export const CLICKHOUSE_SCHEMA_PATH = resolve(import.meta.dirname, "schema.sql")

/**
 * Load a SQL schema file into a chdb session.
 * Strips SQL comments and executes each semicolon-delimited statement.
 * Base tables are created before materialized views so that MV source
 * references resolve correctly regardless of alphabetical file ordering.
 */
export function loadClickHouseSchema(ch: TestClickHouse, schemaPath: string = CLICKHOUSE_SCHEMA_PATH): void {
  const raw = readFileSync(schemaPath, "utf-8")
  const stripped = raw.replace(/^--.*$/gm, "")
  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)

  const tables = statements.filter((s) => /^CREATE\s+TABLE\b/i.test(s))
  const views = statements.filter((s) => /^CREATE\s+MATERIALIZED\s+VIEW\b/i.test(s))
  const rest = statements.filter((s) => !/^CREATE\s+TABLE\b/i.test(s) && !/^CREATE\s+MATERIALIZED\s+VIEW\b/i.test(s))

  for (const stmt of [...tables, ...views, ...rest]) {
    ch.session.query(stmt)
  }
}

/**
 * TRUNCATE every user table in the chdb session.
 * Queries system.tables for non-system, non-view tables and truncates each.
 */
export function truncateClickHouseTables(ch: TestClickHouse): void {
  const raw = ch.session.query(
    "SELECT name FROM system.tables WHERE database = 'default' AND engine NOT LIKE '%View%'",
    "JSONEachRow",
  )
  const trimmed = raw.trim()
  if (!trimmed) return
  for (const line of trimmed.split("\n")) {
    const { name } = JSON.parse(line) as { name: string }
    ch.session.query(`TRUNCATE TABLE ${name}`)
  }
}

interface TestClickHouseContext {
  readonly client: ClickHouseClient
}

/**
 * Registers beforeAll / beforeEach / afterAll hooks for a chdb-backed test file.
 * - beforeAll: creates session + loads schema
 * - beforeEach: truncates all tables
 * - afterAll: destroys the session
 *
 * Returns an object whose `client` property resolves lazily after beforeAll.
 */
export function setupTestClickHouse(): TestClickHouseContext {
  let ch: TestClickHouse

  beforeAll(() => {
    ch = createTestClickHouse()
    loadClickHouseSchema(ch)
  })

  beforeEach(() => {
    truncateClickHouseTables(ch)
  })

  afterAll(() => {
    ch.cleanup()
  })

  return {
    get client() {
      return ch.client
    },
  }
}
