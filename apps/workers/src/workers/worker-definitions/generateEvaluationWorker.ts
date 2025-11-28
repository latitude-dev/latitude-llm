import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  calculateMCCParentJob: jobs.calculateMCCParentJob,
  generateEvaluationV2FromIssueJob: jobs.generateEvaluationV2FromIssueJob,
}

export function startGenerateEvaluationWorker() {
  return createWorker(Queues.generateEvaluationsQueue, jobMappings, {
    concurrency: 100,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
