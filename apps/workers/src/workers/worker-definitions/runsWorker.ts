import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { LONG_RUNNING_WORKER_OPTIONS } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  backgroundRunJob: jobs.backgroundRunJob,
}

export function startRunsWorker() {
  return createWorker(Queues.runsQueue, jobMappings, {
    ...LONG_RUNNING_WORKER_OPTIONS,
    concurrency: 100,
  })
}
