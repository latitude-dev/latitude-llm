import type { ClickHouseClient } from "@clickhouse/client"
import type { RedisConnection } from "@platform/cache-redis"
import { createRedisConnection } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresPool } from "@platform/db-postgres"
import type { StorageDisk } from "@platform/storage-object"
import { createStorageDisk } from "@platform/storage-object"
import type { Pool } from "pg"

let redisConnectionInstance: RedisConnection | undefined
let pgPoolInstance: Pool | undefined
let clickhouseInstance: ClickHouseClient | undefined
let storageDiskInstance: StorageDisk | undefined

export const getRedisConnection = (): RedisConnection => {
  if (!redisConnectionInstance) {
    redisConnectionInstance = createRedisConnection()
  }
  return redisConnectionInstance
}

export const getPostgresPool = (maxConnections?: number): Pool => {
  if (!pgPoolInstance) {
    pgPoolInstance = createPostgresPool(maxConnections ? { maxConnections } : undefined)
  }
  return pgPoolInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseInstance) {
    clickhouseInstance = createClickhouseClient()
  }
  return clickhouseInstance
}

export const getStorageDisk = (): StorageDisk => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}
