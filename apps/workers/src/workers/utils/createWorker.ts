import { Queues } from '@latitude-data/core/queues/types'
import { REDIS_KEY_PREFIX } from '@latitude-data/core/redis'
import { captureException } from './captureException'
import {
  moveToDeadLetterQueue,
  shouldMoveToDeadLetter,
} from './deadLetterHandler'
import { attachWorkerObserver } from './jobLifecycleObserver'

import { Job, Worker, WorkerOptions } from 'bullmq'
import { WORKER_OPTIONS } from './connectionConfig'
import { createJobHandler } from './createJobHandler'

export type CreateWorkerOptions = {
  workerOptions?: WorkerOptions
  enableLifecycleObserver?: boolean
  maxConcurrency?: number
}

/**
 * Creates a fully configured BullMQ worker with job handling, error handling,
 * dead-letter queue support, and optional lifecycle observation.
 * @param queue The queue to process
 * @param jobMappings Object mapping job names to their handler functions
 * @param options Optional configuration including worker options and lifecycle observer
 * @returns A configured BullMQ Worker instance
 */
export function createWorker<T extends Record<string, Function>>(
  queue: Queues,
  jobMappings: T,
  options: CreateWorkerOptions = {},
): Worker {
  const {
    workerOptions = WORKER_OPTIONS,
    enableLifecycleObserver = true,
    maxConcurrency = workerOptions.concurrency || 1,
  } = options

  const worker = new Worker(queue, createJobHandler(jobMappings), {
    ...workerOptions,
    prefix: REDIS_KEY_PREFIX,
  })

  worker.on('error', (error: Error) => {
    captureException(error)
  })

  worker.on('failed', async (job: Job | undefined, error: Error) => {
    if (!job) return

    if (shouldMoveToDeadLetter(job)) {
      await moveToDeadLetterQueue(job, error)
    }
  })

  if (enableLifecycleObserver) {
    attachWorkerObserver(worker, maxConcurrency)
  }

  return worker
}
