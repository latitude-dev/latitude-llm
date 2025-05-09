import { env } from '@latitude-data/env'
import Redis from 'ioredis'

import { buildRedisConnection } from '../redis'

let connection: Redis

export const cache = async () => {
  if (connection) return connection

  const redisOptions: any = {
    // Use 'any' or a more specific type for options
    host: env.CACHE_HOST,
    port: env.CACHE_PORT,
  }
  if (env.CACHE_PASSWORD) {
    redisOptions.password = env.CACHE_PASSWORD
  }
  connection = await buildRedisConnection(redisOptions)
  return connection
}
