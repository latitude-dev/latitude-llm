import { env } from '@latitude-data/env'
import Redis from 'ioredis'

import { buildRedisConnection } from '../redis'

let connection: Redis

export const cache = () => {
  if (connection) return connection

  connection = buildRedisConnection({
    host: env.CACHE_HOST,
    port: env.CACHE_PORT,
  })

  return connection
}
