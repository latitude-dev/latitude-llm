import type { RedisConnection } from "@platform/cache-redis"
import { createRedisConnection } from "@platform/cache-redis"
import { createPostgresPool } from "@platform/db-postgres"
import type { Pool } from "pg"

let redisConnectionInstance: RedisConnection | undefined
let pgPoolInstance: Pool | undefined

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
