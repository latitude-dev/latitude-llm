import Redis, { RedisOptions } from 'ioredis'

export const REDIS_KEY_PREFIX = 'latitude:'

export function buildRedisConnection({ port, host, ...opts }: RedisOptions) {
  if (!port) throw new Error('Redis port is required')
  if (!host) throw new Error('Redis host is required')

  return new Promise<Redis>((resolve) => {
    const instance = new Redis(port, host, {
      // Limit connection attempts to prevent resource exhaustion
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      // Add retry strategy with exponential backoff
      retryStrategy(times) {
        if (times > 3) {
          // Stop retrying after 3 attempts to prevent connection buildup
          return null
        }
        // Exponential backoff: 50ms, 100ms, 200ms
        return Math.min(times * 50, 2000)
      },
      // Set reasonable timeouts to prevent hanging connections
      connectTimeout: 10000, // 10 seconds
      commandTimeout: 5000, // 5 seconds for commands

      // Override default key prefix
      ...opts,
    })

    instance.connect(() => {
      resolve(instance)
    })
  })
}
