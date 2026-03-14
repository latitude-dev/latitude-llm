import { type ClickHouseClient, type ClickhouseConfig, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresPool } from "@platform/db-postgres"
import type { Pool } from "pg"

let pgPoolInstance: Pool | undefined
let clickhouseInstance: ClickHouseClient | undefined

export const getPostgresPool = (maxConnections?: number): Pool => {
  if (!pgPoolInstance) {
    pgPoolInstance = createPostgresPool(maxConnections ? { maxConnections } : undefined)
  }
  return pgPoolInstance
}

export const getClickhouseClient = (config?: ClickhouseConfig): ClickHouseClient => {
  if (!clickhouseInstance) clickhouseInstance = createClickhouseClient(config)

  return clickhouseInstance
}
