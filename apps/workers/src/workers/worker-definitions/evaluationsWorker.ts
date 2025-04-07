import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const jobMappings = {
  runEvaluationJob: jobs.runEvaluationJob,
  runEvaluationV2Job: jobs.runEvaluationV2Job,
  runBatchEvaluationJob: jobs.runBatchEvaluationJob,
}

export function startEvaluationsWorker() {
  return createWorker(Queues.evaluationsQueue, jobMappings, {
    concurrency: 50,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
