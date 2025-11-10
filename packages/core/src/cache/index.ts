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
 * If lock acquisition fails due to timeout, it will automatically retry with exponential backoff
 * to handle transient lock contention scenarios (e.g., multiple jobs updating the same cache key).
 *
 * @param lockKey - The unique identifier for the lock. Will be prefixed with "lock:" internally
 * @param callback - The function to execute while holding the lock. Receives the Redis cache instance
 * @param timeout - Maximum time in milliseconds to wait for lock acquisition per attempt (default: 5000ms)
 * @param maxRetries - Maximum number of retry attempts for lock acquisition (default: 5)
 *
 * @returns Promise that resolves to the return value of the callback function
 * @throws Error if lock cannot be acquired after all retry attempts
 */
export const withCacheLock = async <T>({
  lockKey,
  callbackFn,
  timeout = 1000,
  maxRetries = 5,
}: {
  lockKey: string
  callbackFn: (cache: Cache) => Promise<T>
  timeout?: number
  maxRetries?: number
}): Promise<T> => {
  const redis = await cache()

  lockKey = `lock:${lockKey}`
  const lockValue = Math.random().toString(36)
  const lockTtl = 10000
  const lockDelay = 50

  let lastError: Error | undefined

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startedAt = Date.now()

    // Try to acquire lock within timeout
    while (Date.now() - startedAt < timeout) {
      const acquired = await redis.set(lockKey, lockValue, 'PX', lockTtl, 'NX')
      if (acquired === 'OK') {
        try {
          return await callbackFn(redis)
        } finally {
          // Release lock only if we still own it
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

    // Lock acquisition timed out for this attempt
    lastError = new Error(
      `Failed to acquire lock for key "${lockKey}" within ${timeout}ms (attempt ${attempt}/${maxRetries})`,
    )

    // If not the last attempt, wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const backoffDelay = Math.min(500 * attempt, 3000) // 500ms, 1s, 1.5s, 2s, 2.5s, 3s (max)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
    }
  }

  // All retry attempts exhausted
  throw lastError!
}
