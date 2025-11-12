import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { env } from '@latitude-data/env'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  backgroundRunJob: jobs.backgroundRunJob,
}

export function startRunsWorker() {
  // Set lockDuration to account for stream processing (10min), additional processing after streaming (experiment handling, cleanup, etc.), and a safety buffer.
  const lockDuration = Math.round(env.KEEP_ALIVE_TIMEOUT * 1.5) // 15 minutes total

  return createWorker(Queues.runsQueue, jobMappings, {
    concurrency: 100,
    connection: WORKER_CONNECTION_CONFIG,
    lockDuration,
  })
}
