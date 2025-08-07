import * as jobs from '@latitude-data/core/jobs/definitions'
import { Queues } from '@latitude-data/core/queues/types'
import { WORKER_CONNECTION_CONFIG } from '../utils/connectionConfig'
import { createWorker } from '../utils/createWorker'

const jobMappings = {
  processWebhookJob: jobs.processWebhookJob,
  processIndividualWebhookJob: jobs.processIndividualWebhookJob,
}

export function startWebhooksWorker() {
  return createWorker(Queues.webhooksQueue, jobMappings, {
    concurrency: 50,
    connection: WORKER_CONNECTION_CONFIG,
  })
}
