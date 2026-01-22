import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_OPTIONS } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  validateGeneratedEvaluationJob: jobs.validateGeneratedEvaluationJob,
  generateEvaluationV2FromIssueJob: jobs.generateEvaluationV2FromIssueJob,
  recalculateAlignmentMetricJob: jobs.recalculateAlignmentMetricJob,
}

export function startGenerateEvaluationWorker() {
  return createWorker(Queues.generateEvaluationsQueue, jobMappings, {
    ...WORKER_OPTIONS,
    concurrency: 100,
  })
}
