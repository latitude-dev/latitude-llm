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
 * Postgres client using the admin (superuser) connection.
 * Use this only for cross-org operations that must bypass RLS:
 * - API key auth lookups (token hash → org mapping)
 * - Touch buffer batch updates
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

/**
 * Get or create the Redis client instance.
 *
 * This is a singleton to ensure the same Redis client is used
 * across routes and middleware.
 */
export const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    const redisConn = createRedisConnection()
    redisInstance = createRedisClient(redisConn)
  }
  return redisInstance
}
