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

/**
 * Executes a callback function while holding a distributed Redis lock.
 *
 * This function implements a distributed locking mechanism to ensure that only one process
 * can execute the callback for a given lock key at a time. It uses Redis SET with NX and PX
 * options to atomically acquire a lock with a TTL, and releases the lock using a Lua script
 * to ensure the lock is only released by the process that acquired it.
 *
 * @param lockKey - The unique identifier for the lock. Will be prefixed with "lock:" internally
 * @param callback - The function to execute while holding the lock. Receives the Redis cache instance
 * @param timeout - Maximum time in milliseconds to wait for lock acquisition (default: 5000ms)
 *
 * @returns Promise that resolves to the return value of the callback function
 */
export const withCacheLock = async <T>(
  lockKey: string,
  callback: (cache: Cache) => Promise<T>,
  timeout = 5000,
): Promise<T> => {
  const redis = await cache()

  lockKey = `lock:${lockKey}`
  const lockValue = Math.random().toString(36)
  const lockTtl = 10000
  const lockDelay = 50

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const acquired = await redis.set(lockKey, lockValue, 'PX', lockTtl, 'NX')
    if (acquired === 'OK') {
      try {
        return await callback(redis)
      } finally {
        // Note: Release lock only if we still own it
        await redis.eval(
          `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`.trim(),
          1,
          lockKey,
          lockValue,
        )
      }
    }
    await new Promise((resolve) => setTimeout(resolve, lockDelay))
  }

  throw new Error(
    `Failed to acquire lock for key "${lockKey}" within ${timeout}ms`,
  )
}
