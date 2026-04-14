import type { WorkflowStarterShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import { createPostHogClient, loadPostHogConfig, type PostHogClientShape } from "@platform/analytics-posthog"
import { createRedisClient, createRedisConnection, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, type ClickhouseConfig, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { createWeaviateClient, type WeaviateClient, type WeaviateConfig } from "@platform/db-weaviate"
import { parseEnv } from "@platform/env"
import { createStorageDisk } from "@platform/storage-object"
import { createTemporalClient, createWorkflowStarter, loadTemporalConfig } from "@platform/workflows-temporal"
import { Effect } from "effect"

let pgClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseInstance: ClickHouseClient | undefined
let weaviateInstancePromise: Promise<WeaviateClient> | undefined
let storageDiskInstance: StorageDiskPort | undefined
let redisInstance: RedisClient | undefined
let workflowStarterPromise: Promise<WorkflowStarterShape> | undefined
let posthogClientInstance: PostHogClientShape | undefined

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
  if (!clickhouseInstance) {
    clickhouseInstance = createClickhouseClient(config)
  }

  return clickhouseInstance
}

export const getWeaviateClient = (config?: WeaviateConfig): Promise<WeaviateClient> => {
  if (!weaviateInstancePromise) {
    weaviateInstancePromise = createWeaviateClient(config)
  }

  return weaviateInstancePromise
}

export const getStorageDisk = (): StorageDiskPort => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }

  return storageDiskInstance
}

export const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    const redisConn = createRedisConnection()
    redisInstance = createRedisClient(redisConn)
  }

  return redisInstance
}

export const getPostHogClient = (): PostHogClientShape => {
  if (!posthogClientInstance) {
    const config = Effect.runSync(loadPostHogConfig)
    posthogClientInstance = createPostHogClient(config)
  }

  return posthogClientInstance
}

export function getWorkflowStarter(): Promise<WorkflowStarterShape> {
  if (!workflowStarterPromise) {
    const config = loadTemporalConfig()
    workflowStarterPromise = createTemporalClient(config).then((client) => createWorkflowStarter(client, config))
  }

  return workflowStarterPromise
}
