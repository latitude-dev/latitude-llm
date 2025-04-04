import { env } from '@latitude-data/env'

/**
 * Common connection configuration for BullMQ workers
 */
export const connectionConfig = {
  connection: {
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
  },
}
