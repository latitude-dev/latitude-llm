import { Redis, type RedisOptions } from "ioredis"
import type { RedisConnection } from "./connection.ts"

export const buildRedisConnectionOptions = (
  connection: Pick<RedisConnection, "host" | "port" | "password" | "tls">,
): Pick<RedisOptions, "host" | "port" | "password" | "tls"> => ({
  host: connection.host,
  port: connection.port,
  ...(connection.password ? { password: connection.password } : {}),
  ...(connection.tls ? { tls: {} } : {}),
})

/**
 * Create an ioredis client from connection config
 */
export const createRedisClient = (connection: RedisConnection): Redis => {
  return new Redis({
    ...buildRedisConnectionOptions(connection),
    // Default to db 0, can be extended later
    db: 0,
    // Fail fast instead of buffering commands indefinitely when Redis is unavailable.
    enableOfflineQueue: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    // Retry strategy with exponential backoff
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  })
}

/**
 * Type alias for Redis client
 */
export type RedisClient = Redis
