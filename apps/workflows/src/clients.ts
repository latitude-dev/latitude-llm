import { createRedisClient, createRedisConnection, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import type { WeaviateClient } from "@platform/db-weaviate"
import { createWeaviateClient } from "@platform/db-weaviate"

let postgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let weaviateClientInstancePromise: Promise<WeaviateClient> | undefined
let redisInstance: RedisClient | undefined

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }

  return postgresClientInstance
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
