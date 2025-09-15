import { env } from '@latitude-data/env'
import { Queue, QueueOptions } from 'bullmq'
import { Queues } from './types'
import { buildRedisConnection } from '../../redis'

let _queues:
  | {
      defaultQueue: Queue
      documentSuggestionsQueue: Queue
      documentsQueue: Queue
      evaluationsQueue: Queue
      eventHandlersQueue: Queue
      eventsQueue: Queue
      maintenanceQueue: Queue
      tracingQueue: Queue
      webhooksQueue: Queue
    }
  | undefined

export async function queues() {
  if (_queues) return _queues

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

  _queues = {
    defaultQueue: new Queue(Queues.defaultQueue, options),
    documentSuggestionsQueue: new Queue(Queues.documentSuggestionsQueue, options), // prettier-ignore
    documentsQueue: new Queue(Queues.documentsQueue, options),
    evaluationsQueue: new Queue(Queues.evaluationsQueue, options),
    eventHandlersQueue: new Queue(Queues.eventHandlersQueue, options),
    eventsQueue: new Queue(Queues.eventsQueue, options),
    maintenanceQueue: new Queue(Queues.maintenanceQueue, options),
    tracingQueue: new Queue(Queues.tracingQueue, options),
    webhooksQueue: new Queue(Queues.webhooksQueue, options),
  }

  return _queues
}
