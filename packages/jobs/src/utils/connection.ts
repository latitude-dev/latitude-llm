import { env } from '@latitude-data/env'

import { buildConnection } from '../connection'

export const connection = buildConnection({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
})
