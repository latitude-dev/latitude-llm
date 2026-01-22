import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_OPTIONS } from '../utils/connectionConfig'

const jobMappings = {
  runEvaluationV2Job: jobs.runEvaluationV2Job,
  runEvaluationForExperimentJob: jobs.runEvaluationForExperimentJob,
}

export function startEvaluationsWorker() {
  return createWorker(Queues.evaluationsQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 100,
  })
}
