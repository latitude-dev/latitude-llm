import { env } from '@latitude-data/env'
import Redis, { RedisOptions } from 'ioredis'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../redis'

export type Cache = Redis

let connection: Redis | null = null
let connectionPromise: Promise<Redis> | null = null

export const cache = async (): Promise<Redis> => {
  // Return existing connection if available
  if (connection) return connection

  // If connection is being established, wait for it to prevent race conditions
  if (connectionPromise) return connectionPromise

  // Establish new connection
  const redisOptions: RedisOptions = {
    // Use 'any' or a more specific type for options
    host: env.CACHE_HOST,
    port: env.CACHE_PORT,
    keyPrefix: REDIS_KEY_PREFIX,
  }
  if (env.CACHE_PASSWORD) {
    redisOptions.password = env.CACHE_PASSWORD
  }

  // Store the promise to prevent multiple concurrent connection attempts
  connectionPromise = buildRedisConnection(redisOptions)

  try {
    connection = await connectionPromise
    return connection
  } finally {
    // Clear the promise once connection is established (success or failure)
    connectionPromise = null
  }
}

export const getOrSet = async <T>(
  key: string,
  callback: () => Promise<T>,
  ttl: number = 3600, // Default 1 hour
): Promise<T> => {
  const cacheClient = await cache()

  try {
    const cached = await cacheClient.get(key)
    if (cached !== null && cached !== undefined) {
      return JSON.parse(cached)
    }
  } catch (_error) {
    // Ignore cache read errors, proceed to compute
  }

  const result = await callback()

  try {
    const serialized = JSON.stringify(result)
    await cacheClient.set(key, serialized, 'EX', ttl)
  } catch (_error) {
    // Ignore cache write errors
  }

  return result
}
