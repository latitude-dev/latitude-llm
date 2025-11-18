import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const jobMappings = {
  runEvaluationV2Job: jobs.runEvaluationV2Job,
  runEvaluationForExperimentJob: jobs.runEvaluationForExperimentJob,
  generateEvaluationV2FromIssueJob: jobs.generateEvaluationV2FromIssueJob,
}

export function startEvaluationsWorker() {
  return createWorker(Queues.evaluationsQueue, jobMappings, {
    concurrency: 100,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
