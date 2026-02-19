import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  backgroundRunJob: jobs.backgroundRunJob,
}

export function startRunsWorker() {
  return createWorker(Queues.runsQueue, jobMappings, {
    concurrency: 25,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
