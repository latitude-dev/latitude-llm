import { buildRedisConnectionOptions } from "@platform/cache-redis"
import { Cluster, Redis } from "ioredis"

interface BullMqConnectionConfig {
  readonly host: string
  readonly port: number
  readonly password?: string
  readonly tls?: boolean
  readonly cluster?: boolean
}

const buildRedisOptions = (redis: BullMqConnectionConfig) => ({
  ...buildRedisConnectionOptions(redis),
  maxRetriesPerRequest: null,
})

export const createBullMqRedisConnection = (redis: BullMqConnectionConfig): Cluster | Redis => {
  if (redis.cluster) {
    return new Cluster([{ host: redis.host, port: redis.port }], {
      redisOptions: buildRedisOptions(redis),
    })
  }

  return new Redis(buildRedisOptions(redis))
}
