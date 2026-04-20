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

const passthroughDnsLookup = (
  address: string,
  callback: (error: NodeJS.ErrnoException | null, address: string) => void,
) => {
  callback(null, address)
}

export const createBullMqRedisConnection = (redis: BullMqConnectionConfig): Cluster | Redis => {
  if (redis.cluster) {
    return new Cluster([{ host: redis.host, port: redis.port }], {
      // AWS MemoryDB/ElastiCache with TLS expects the hostname to be preserved so
      // the cluster client can complete TLS validation while refreshing slots.
      dnsLookup: passthroughDnsLookup,
      redisOptions: buildRedisOptions(redis),
    })
  }

  return new Redis(buildRedisOptions(redis))
}
