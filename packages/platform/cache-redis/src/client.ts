import { Redis } from "ioredis"
import type { RedisConnection } from "./connection.ts"

/**
 * Create an ioredis client from connection config
 */
export const createRedisClient = (connection: RedisConnection): Redis => {
  return new Redis({
    host: connection.host,
    port: connection.port,
    // Default to db 0, can be extended later
    db: 0,
    // Enable offline queue to buffer commands when disconnected
    enableOfflineQueue: true,
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
