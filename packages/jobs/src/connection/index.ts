import { buildRedisConnection } from '@latitude-data/core/redis'

export type ConnectionParams = {
  port?: number
  host: string
  password?: string
}

export function buildConnection({
  host,
  port = 6379,
  password,
}: ConnectionParams) {
  return buildRedisConnection({
    host,
    port,
    password,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  })
}
