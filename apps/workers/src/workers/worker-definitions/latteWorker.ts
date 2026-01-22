import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const CONCURRENCY = 25

const jobMappings = {
  runLatteJob: jobs.runLatteJob,
}

export function startLatteWorker() {
  return createWorker(Queues.latteQueue, jobMappings, {
    workerOptions: {
      concurrency: CONCURRENCY,
      connection: WORKER_CONNECTION_CONFIG,
    },
    maxConcurrency: CONCURRENCY,
  })
}
