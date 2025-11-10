import { env } from '@latitude-data/env'
import { Queue, QueueOptions } from 'bullmq'
import { buildRedisConnection, REDIS_KEY_PREFIX } from '../../redis'
import { Queues } from './types'

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
      latteQueue: Queue
      runsQueue: Queue
      issuesQueue: Queue
    }
  | undefined

export async function queues() {
  if (_queues) return _queues

  const options: QueueOptions = {
    prefix: REDIS_KEY_PREFIX,
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
      removeOnFail: 100,
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
    latteQueue: new Queue(Queues.latteQueue, options),
    runsQueue: new Queue(Queues.runsQueue, options),
    issuesQueue: new Queue(Queues.issuesQueue, options),
  }

  return _queues
}
