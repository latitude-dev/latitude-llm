import type { ClickHouseClient } from "@clickhouse/client"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { type PostgresDb, createPostgresClient } from "@platform/db-postgres"
import type { Pool } from "pg"

let postgresClientInstance: { db: PostgresDb; pool: Pool } | undefined
let clickhouseInstance: ClickHouseClient | undefined

export const getPostgresClient = (): { db: PostgresDb; pool: Pool } => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseInstance) {
    clickhouseInstance = createClickhouseClient()
  }
  return clickhouseInstance
}
