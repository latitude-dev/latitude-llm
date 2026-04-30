import type { QueuePublisherShape } from "@domain/queue"
import { createRedisClient, createRedisConnection, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { createWeaviateClient, type WeaviateClient } from "@platform/db-weaviate"
import { parseEnv } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let weaviateClientInstancePromise: Promise<WeaviateClient> | undefined
let redisInstance: RedisClient | undefined
let queuePublisherPromise: Promise<QueuePublisherShape> | undefined

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }

  return postgresClientInstance
}

/**
 * Postgres client that connects with the superuser (RLS-bypass) role.
 * Use this only for workflow activities that legitimately need to write
 * across multiple orgs in one operation — today, the "Create Demo
 * Project" seed activity is the only caller. Everything else should go
 * through `getPostgresClient()` so RLS protects multi-tenant data.
 *
 * Note: the seed activity uses the bare drizzle client (`client.db`)
 * rather than the `SqlClient` abstraction, so RLS context is never set
 * on the connection — that's fine for the admin URL because its role
 * has BYPASSRLS, but it would fail loudly with the standard role.
 */
export const getAdminPostgresClient = (): PostgresClient => {
  if (!adminPostgresClientInstance) {
    const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
    adminPostgresClientInstance = createPostgresClient({ databaseUrl: adminUrl })
  }
  return adminPostgresClientInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseClientInstance) {
    clickhouseClientInstance = createClickhouseClient()
  }

  return clickhouseClientInstance
}

export const getWeaviateClient = (): Promise<WeaviateClient> => {
  if (!weaviateClientInstancePromise) {
    weaviateClientInstancePromise = createWeaviateClient()
  }

  return weaviateClientInstancePromise
}

export const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    redisInstance = createRedisClient(createRedisConnection())
  }

  return redisInstance
}

export const getQueuePublisher = (): Promise<QueuePublisherShape> => {
  if (!queuePublisherPromise) {
    const bullMqConfig = Effect.runSync(loadBullMqConfig())
    queuePublisherPromise = Effect.runPromise(createBullMqQueuePublisher({ redis: bullMqConfig }))
  }

  return queuePublisherPromise
}
