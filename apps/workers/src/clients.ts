import { type ClickHouseClient, type ClickhouseConfig, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { createStorageDisk, type StorageDisk } from "@platform/storage-object"

let pgClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let storageDiskInstance: StorageDisk | undefined

export const getPostgresClient = (maxConnections?: number): PostgresClient => {
  if (!pgClientInstance) {
    pgClientInstance = createPostgresClient(maxConnections ? { maxConnections } : undefined)
  }

  return pgClientInstance
}

export const getClickhouseClient = (config?: ClickhouseConfig): ClickHouseClient => {
  if (!clickhouseInstance) clickhouseInstance = createClickhouseClient(config)

  return clickhouseInstance
}

export const getStorageDisk = (): StorageDisk => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}
