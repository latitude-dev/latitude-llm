import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  evaluateLiveLogJob: jobs.evaluateLiveLogJob,
  runLiveEvaluationsJob: jobs.runLiveEvaluationsJob,
  runLiveEvaluationJob: jobs.runLiveEvaluationJob,
}

export function startLiveEvaluationsWorker() {
  return createWorker(Queues.liveEvaluationsQueue, jobMappings)
}
