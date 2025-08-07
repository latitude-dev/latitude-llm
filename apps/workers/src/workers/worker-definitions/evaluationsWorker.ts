import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  runEvaluationV2Job: jobs.runEvaluationV2Job,
}

export function startEvaluationsWorker() {
  return createWorker(Queues.evaluationsQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
