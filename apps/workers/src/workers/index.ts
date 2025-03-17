import { captureException } from '$/utils/sentry'
import { setupSchedules } from '@latitude-data/core/jobs'
import { Worker } from 'bullmq'

import { defaultWorker } from './worker-definitions/defaultWorker'
import { buildRedisConnection } from '@latitude-data/core/redis'
import { env } from '@latitude-data/env'

const WORKER_OPTS = {
  concurrency: 5,
  autorun: true,
  ...(process.env.NODE_ENV !== 'development' && {
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }),
}
const WORKERS = [defaultWorker]

export default async function startWorkers() {
  await setupSchedules()

  const connection = await buildRedisConnection({
    host: env.QUEUE_HOST,
    port: env.QUEUE_PORT,
    password: env.QUEUE_PASSWORD,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) =>
      Math.max(Math.min(Math.exp(times), 20000), 1000), // Exponential backoff with a max of 20 seconds and a min of 1 second
  })

  return WORKERS.flatMap((w) =>
    w.queues.map((q) => {
      const worker = new Worker(q, w.processor, {
        ...WORKER_OPTS,
        connection,
      })

      worker.on('error', (error: Error) => {
        captureException(error)
      })

      return worker
    }),
  )
}
