import type { ClickHouseClient } from "@clickhouse/client"
import type { QueuePublisher } from "@domain/queue"
import type { RedisClient } from "@platform/cache-redis"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined
let queuePublisherPromise: Promise<QueuePublisher> | undefined

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

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

export const getQueuePublisher = (): Promise<QueuePublisher> => {
  if (!queuePublisherPromise) {
    queuePublisherPromise = (async () => {
      const config = Effect.runSync(loadBullMqConfig())
      return Effect.runPromise(createBullMqQueuePublisher({ redis: config }))
    })().catch((error) => {
      queuePublisherPromise = undefined
      throw error
    })
  }
  return queuePublisherPromise
}
