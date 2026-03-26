import type { StorageDiskPort } from "@domain/shared"
import { type ClickHouseClient, type ClickhouseConfig, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createStorageDisk } from "@platform/storage-object"
import { Effect } from "effect"

let pgClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let storageDiskInstance: StorageDiskPort | undefined

export const getPostgresClient = (maxConnections?: number): PostgresClient => {
  if (!pgClientInstance) {
    pgClientInstance = createPostgresClient(maxConnections ? { maxConnections } : undefined)
  }

  return pgClientInstance
}

export const getAdminPostgresClient = (): PostgresClient => {
  if (!adminPostgresClientInstance) {
    const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
    adminPostgresClientInstance = createPostgresClient({
      databaseUrl: adminUrl,
    })
  }

  return adminPostgresClientInstance
}

export const getClickhouseClient = (config?: ClickhouseConfig): ClickHouseClient => {
  if (!clickhouseInstance) clickhouseInstance = createClickhouseClient(config)

  return clickhouseInstance
}

export const getStorageDisk = (): StorageDiskPort => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}
