import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  alignEvaluationJob: jobs.alignEvaluationJob,
}

export function startAlignmentsWorker() {
  return createWorker(Queues.alignmentsQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
