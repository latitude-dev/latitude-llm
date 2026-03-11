import type { ClickHouseClient } from "@clickhouse/client"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import type { RedisClient } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { type PostgresClient, createPostgresClient } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined

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
