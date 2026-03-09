import type { ClickHouseClient } from "@clickhouse/client"
import { createBetterAuth } from "@platform/auth-better"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import type { RedisClient } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { type PostgresClient, createPostgresClient } from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined

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

/**
 * Get or create the Better Auth instance.
 *
 * This is a singleton to ensure the same auth instance is used
 * across routes and middleware.
 */
export const getBetterAuth = () => {
  if (!betterAuthInstance) {
    const { db } = getPostgresClient()
    const baseUrl = Effect.runSync(parseEnv("LAT_BETTER_AUTH_URL", "string"))
    const betterAuthSecret = Effect.runSync(parseEnv("LAT_BETTER_AUTH_SECRET", "string"))
    const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))

    // Parse trusted origins from comma-separated env var or fallback to webUrl
    const trustedOriginsEnv = Effect.runSync(parseEnvOptional("LAT_TRUSTED_ORIGINS", "string"))
    const trustedOrigins = trustedOriginsEnv
      ? trustedOriginsEnv
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [webUrl]

    betterAuthInstance = createBetterAuth({
      db,
      secret: betterAuthSecret,
      baseUrl,
      trustedOrigins,
    })
  }
  return betterAuthInstance
}
