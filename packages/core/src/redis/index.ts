import Redis, { RedisOptions } from 'ioredis'

export const REDIS_KEY_PREFIX = 'latitude:'

export function buildRedisConnection({ port, host, ...opts }: RedisOptions) {
  if (!port) throw new Error('Redis port is required')
  if (!host) throw new Error('Redis host is required')

  return new Promise<Redis>((resolve) => {
    const instance = new Redis(port, host, opts)

    instance.connect(() => {
      resolve(instance)
    })
  })
}
