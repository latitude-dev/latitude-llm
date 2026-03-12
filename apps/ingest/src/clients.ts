import type { ClickHouseClient } from "@clickhouse/client"
import { SPAN_INGESTION_QUEUE } from "@domain/shared"
import type { RedisClient, RedisConnection } from "@platform/cache-redis"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import type { StorageDisk } from "@platform/storage-object"
import { createStorageDisk } from "@platform/storage-object"
import { Queue } from "bullmq"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined
let redisConnectionInstance: RedisConnection | undefined
let storageDiskInstance: StorageDisk | undefined
let spanIngestionQueueInstance: Queue | undefined

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

/**
 * Admin Postgres connection that bypasses RLS.
 * Used for cross-org lookups: API key auth and project resolution.
 */
export const getAdminPostgresClient = (): PostgresClient => {
  if (!adminPostgresClientInstance) {
    const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
    adminPostgresClientInstance = createPostgresClient({ databaseUrl: adminUrl })
  }
  return adminPostgresClientInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseInstance) {
    clickhouseInstance = createClickhouseClient()
  }
  return clickhouseInstance
}

export const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    const redisConn = createRedisConnection()
    redisInstance = createRedisClient(redisConn)
  }
  return redisInstance
}

const getRedisConnection = (): RedisConnection => {
  if (!redisConnectionInstance) {
    redisConnectionInstance = createRedisConnection()
  }
  return redisConnectionInstance
}

export const getStorageDisk = (): StorageDisk => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}

export const getSpanIngestionQueue = (): Queue => {
  if (!spanIngestionQueueInstance) {
    spanIngestionQueueInstance = new Queue(SPAN_INGESTION_QUEUE, { connection: getRedisConnection() })
  }
  return spanIngestionQueueInstance
}
