import { queues } from '@latitude-data/core/queues'
import { captureException } from '$/utils/sentry'
import { Worker } from 'bullmq'

import { defaultWorker } from './worker-definitions/defaultWorker'

const WORKER_OPTS = {
  concurrency: 5,
  autorun: true,
  ...(process.env.NODE_ENV !== 'development' && {
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }),
}
const WORKERS = [defaultWorker]

export default function startWorkers() {
  return WORKERS.flatMap((w) =>
    w.queues.map((q) => {
      const worker = new Worker(q, w.processor, {
        ...WORKER_OPTS,
        connection: queues(),
      })

      worker.on('error', (error: Error) => {
        captureException(error)
      })

      return worker
    }),
  )
}
