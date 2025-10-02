import { env } from '@latitude-data/env'
import { QueueEvents } from 'bullmq'
import { Queues } from '../../jobs/queues/types'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'

export const JOB_FINISHED_STATES = ['completed', 'failed', 'unknown']

let subscription: QueueEvents | undefined
export async function subscribeQueue() {
  if (subscription) return subscription

  subscription = new QueueEvents(Queues.runsQueue, {
    prefix: REDIS_KEY_PREFIX,
    connection: await buildRedisConnection({
      host: env.QUEUE_HOST,
      port: env.QUEUE_PORT,
      password: env.QUEUE_PASSWORD,
      maxRetriesPerRequest: 0,
    }),
  })

  return subscription
}
