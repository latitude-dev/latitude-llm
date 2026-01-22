import { Queues } from '@latitude-data/core/queues/types'
import * as jobs from '@latitude-data/core/jobs/definitions'
import { createWorker } from '../utils/createWorker'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'

const CONCURRENCY = 50

const jobMappings = {
  processWebhookJob: jobs.processWebhookJob,
  processIndividualWebhookJob: jobs.processIndividualWebhookJob,
}

export function startWebhooksWorker() {
  return createWorker(Queues.webhooksQueue, jobMappings, {
    workerOptions: {
      concurrency: CONCURRENCY,
      connection: WORKER_CONNECTION_CONFIG,
    },
    maxConcurrency: CONCURRENCY,
  })
}
