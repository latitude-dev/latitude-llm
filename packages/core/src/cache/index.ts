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
