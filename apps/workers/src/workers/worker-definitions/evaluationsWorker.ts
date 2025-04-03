import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  runEvaluationV2Job: jobs.runEvaluationV2Job,
  runBatchEvaluationJob: jobs.runBatchEvaluationJob,
}

export function startEvaluationsWorker() {
  return createWorker(Queues.evaluationsQueue, jobMappings)
}
