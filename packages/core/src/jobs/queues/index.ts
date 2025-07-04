import { env } from '@latitude-data/env'
import { JobsOptions, Queue } from 'bullmq'
import { Queues } from './types'

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: env.JOB_RETRY_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnFail: true,
  removeOnComplete: true,
}

const options = {
  connection: {
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
  },
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
}

export const defaultQueue = new Queue(Queues.defaultQueue, options)
export const evaluationsQueue = new Queue(Queues.evaluationsQueue, options)
export const eventHandlersQueue = new Queue(Queues.eventHandlersQueue, options)
export const eventsQueue = new Queue(Queues.eventsQueue, options)
// FIXME: Not used
export const liveEvaluationsQueue = new Queue(
  Queues.liveEvaluationsQueue,
  options,
)
export const maintenanceQueue = new Queue(Queues.maintenanceQueue, options)
export const webhooksQueue = new Queue(Queues.webhooksQueue, options)
export const documentsQueue = new Queue(Queues.documentsQueue, options)
export const documentSuggestionsQueue = new Queue(
  Queues.documentSuggestionsQueue,
  options,
)
export const tracingQueue = new Queue(Queues.tracingQueue, options)
