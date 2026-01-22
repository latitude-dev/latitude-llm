import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_OPTIONS } from '../utils/connectionConfig'

const jobMappings = {
  runLatteJob: jobs.runLatteJob,
}

export function startLatteWorker() {
  return createWorker(Queues.latteQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 25,
  })
}
