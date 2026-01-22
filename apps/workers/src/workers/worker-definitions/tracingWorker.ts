import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_OPTIONS } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  ingestSpansJob: jobs.ingestSpansJob,
}

export function startTracingWorker() {
  return createWorker(Queues.tracingQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 25,
  })
}
