import { Worker, WorkerOptions } from 'bullmq'
import { Queues } from '@latitude-data/core/queues/types'
import { captureException } from '@latitude-data/core/utils/workers/sentry'
import { WORKER_OPTIONS } from './connectionConfig'
import { createJobHandler } from './createJobHandler'
import { jobTracker } from './jobTracker'

/**
 * Creates a fully configured BullMQ worker with job handling and error handling
 * @param queue The queue to process
 * @param jobMappings Object mapping job names to their handler functions
 * @returns A configured BullMQ Worker instance
 */
export function createWorker<T extends Record<string, Function>>(
  queue: Queues,
  jobMappings: T,
  workerOptions: WorkerOptions = WORKER_OPTIONS,
): Worker {
  const worker = new Worker(queue, createJobHandler(jobMappings), {
    ...workerOptions,
    prefix: 'latitude',
  })

  worker.on('error', (error: Error) => {
    captureException(error)
  })

  // Register worker with job tracker for scale-in protection
  jobTracker.registerWorker(worker)

  return worker
}
