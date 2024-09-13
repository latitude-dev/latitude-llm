import { env } from '@latitude-data/env'

import { buildConnection } from '../connection'

export const connection = buildConnection({
  host: env.QUEUE_HOST,
  port: env.QUEUE_PORT,
  password: env.QUEUE_PASSWORD,
})
