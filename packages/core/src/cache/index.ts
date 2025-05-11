import { env } from '@latitude-data/env'
import Redis from 'ioredis'

import { buildRedisConnection } from '../redis'

let connection: Redis

export const cache = async () => {
  if (connection) return connection

  connection = await buildRedisConnection({
    host: env.CACHE_HOST,
    port: env.CACHE_PORT,
  })

  return connection
}
