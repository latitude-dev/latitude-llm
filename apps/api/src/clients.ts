import type { ClickHouseClient } from "@clickhouse/client"
import type { QueuePublisherShape, WorkflowQuerierShape, WorkflowStarterShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createStorageDisk } from "@platform/storage-object"
import {
  createTemporalClient,
  createWorkflowQuerier,
  createWorkflowStarter,
  loadTemporalConfig,
} from "@platform/workflows-temporal"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let redisInstance: RedisClient | undefined
let storageDiskInstance: StorageDiskPort | undefined
let queuePublisherPromise: Promise<QueuePublisherShape> | undefined
let temporalClientPromise: ReturnType<typeof createTemporalClient> | undefined
let workflowStarterPromise: Promise<WorkflowStarterShape> | undefined
let workflowQuerierPromise: Promise<WorkflowQuerierShape> | undefined

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

export const getStorageDisk = (): StorageDiskPort => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}

export const getQueuePublisher = (): Promise<QueuePublisherShape> => {
  if (!queuePublisherPromise) {
    queuePublisherPromise = (async () => {
      const config = Effect.runSync(loadBullMqConfig())
      return Effect.runPromise(createBullMqQueuePublisher({ redis: config }).pipe(withTracing))
    })().catch((error) => {
      queuePublisherPromise = undefined
      throw error
    })
  }
  return queuePublisherPromise
}

const getTemporalClient = (): ReturnType<typeof createTemporalClient> => {
  if (!temporalClientPromise) {
    const config = loadTemporalConfig()
    temporalClientPromise = createTemporalClient(config).catch((error) => {
      temporalClientPromise = undefined
      throw error
    })
  }
  return temporalClientPromise
}

export const getWorkflowStarter = (): Promise<WorkflowStarterShape> => {
  if (!workflowStarterPromise) {
    const config = loadTemporalConfig()
    workflowStarterPromise = getTemporalClient()
      .then((client) => createWorkflowStarter(client, config))
      .catch((error) => {
        workflowStarterPromise = undefined
        throw error
      })
  }
  return workflowStarterPromise
}

export const getWorkflowQuerier = (): Promise<WorkflowQuerierShape> => {
  if (!workflowQuerierPromise) {
    workflowQuerierPromise = getTemporalClient()
      .then((client) => createWorkflowQuerier(client))
      .catch((error) => {
        workflowQuerierPromise = undefined
        throw error
      })
  }
  return workflowQuerierPromise
}
