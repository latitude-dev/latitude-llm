import { env } from '@latitude-data/env'
import { Queue, QueueOptions } from 'bullmq'
import { Queues } from './types'
import { buildRedisConnection } from '../../redis'

const options: QueueOptions = {
  prefix: 'latitude',
  connection: await buildRedisConnection({
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
  }),
  defaultJobOptions: {
    attempts: env.JOB_RETRY_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnFail: true,
    removeOnComplete: true,
  },
}

export const defaultQueue = new Queue(Queues.defaultQueue, options)
export const documentSuggestionsQueue = new Queue(Queues.documentSuggestionsQueue, options) // prettier-ignore
export const documentsQueue = new Queue(Queues.documentsQueue, options)
export const evaluationsQueue = new Queue(Queues.evaluationsQueue, options)
export const eventHandlersQueue = new Queue(Queues.eventHandlersQueue, options)
export const eventsQueue = new Queue(Queues.eventsQueue, options)
export const maintenanceQueue = new Queue(Queues.maintenanceQueue, options)
export const tracingQueue = new Queue(Queues.tracingQueue, options)
export const webhooksQueue = new Queue(Queues.webhooksQueue, options)
