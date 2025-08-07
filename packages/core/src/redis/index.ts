import Redis, { type RedisOptions } from 'ioredis'

export function buildRedisConnection({
  port,
  host,
  ...opts
}: Omit<RedisOptions, 'port' & 'host'> & { host: string; port: number }) {
  return new Promise<Redis>((resolve) => {
    const instance = new Redis(port, host, opts)

    instance.connect(() => {
      resolve(instance)
    })
  })
}
