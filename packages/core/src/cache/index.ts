import { env } from '@latitude-data/env'
import Redis, { RedisOptions } from 'ioredis'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../redis'

export type Cache = Redis

let connection: Redis

export const cache = async () => {
  if (connection) return connection

  const redisOptions: RedisOptions = {
    // Use 'any' or a more specific type for options
    host: env.CACHE_HOST,
    port: env.CACHE_PORT,
    keyPrefix: REDIS_KEY_PREFIX,
  }
  if (env.CACHE_PASSWORD) {
    redisOptions.password = env.CACHE_PASSWORD
  }

  connection = await buildRedisConnection(redisOptions)

  return connection
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
  } catch (error) {
    // Ignore cache read errors, proceed to compute
  }

  const result = await callback()

  try {
    const serialized = JSON.stringify(result)
    await cacheClient.set(key, serialized, 'EX', ttl)
  } catch (error) {
    // Ignore cache write errors
  }

  return result
}
