import { captureException } from '$/utils/sentry'
import { setupSchedules } from '@latitude-data/core/jobs'
import { queues } from '@latitude-data/core/queues'
import { Worker } from 'bullmq'

import { defaultWorker } from './worker-definitions/defaultWorker'
import { evaluationsWorker } from './worker-definitions/evaluationsWorker'

const WORKER_OPTS = {
  concurrency: 5,
  autorun: true,
  ...(process.env.NODE_ENV !== 'development' && {
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }),
}
const WORKERS = [defaultWorker, evaluationsWorker]

export default async function startWorkers() {
  const connection = await queues({ enableOfflineQueue: true })

  await setupSchedules(connection)

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
