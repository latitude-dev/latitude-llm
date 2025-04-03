import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  runLiveEvaluation: jobs.runLiveEvaluationJob,
}

export function startLiveEvaluationsWorker() {
  return createWorker(Queues.liveEvaluationsQueue, jobMappings)
}
