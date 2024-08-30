import Redis, { RedisOptions } from 'ioredis'

export function buildRedisConnection({
  port,
  host,
  ...opts
}: Omit<RedisOptions, 'port' & 'host'> & { host: string; port: number }) {
  console.log('🔥 Connecting to Redis')

  return new Redis(port, host, opts)
}
